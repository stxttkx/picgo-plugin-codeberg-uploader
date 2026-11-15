import { IPicGo, IImgInfo } from 'picgo'
import { getNow, getPath } from './helper'
import { PluginConfig, ImgType } from './interface'
import urlJoin from 'url-join'

export class Codeberg {
  owner: string = ''
  repo: string = ''
  branch: string = ''
  path: string = ''
  token: string = ''
  customUrl: string = ''
  ctx: IPicGo
  baseUrl = 'https://codeberg.org/api/v1'
  constructor({
    repo,
    branch,
    path = '',
    token,
    customPath = '',
    customUrl = ''
  }: PluginConfig, ctx: IPicGo) {
    const [owner, r] = repo.split('/')
    if (!r) throw new Error('Error in repo name')
    this.owner = owner
    this.repo = r
    this.branch = branch || 'main'
    this.token = token
    this.customUrl = customUrl
    this.ctx = ctx
    this.path = getPath(path, customPath)
  }

  authHeaders() {
    // Codeberg 基于 Forgejo，认证走 Authorization: token <PAT> 请求头
    return {
      Authorization: `token ${this.token}`,
      'Content-Type': 'application/json'
    }
  }

  /**
   * 列出配置目录下的内容。
   * Forgejo: GET /repos/:owner/:repo/contents/:path?ref=branch
   * 目录返回条目数组（name/path/type/sha/download_url...）
   */
  async listDir(): Promise<any[]> {
    const url = encodeURI(urlJoin(
      this.baseUrl,
      'repos',
      this.owner,
      this.repo,
      'contents',
      this.path
    ))
    const params: any = {
      method: 'GET',
      json: true,
      resolveWithFullResponse: true,
      url: url,
      qs: { ref: this.branch },
      headers: this.authHeaders()
    }
    let result: any = await this.ctx.Request.request(params)
    if (result && result.statusCode === 200) {
      return Array.isArray(result.body) ? result.body : []
    }
    this.ctx.log.error('listDir error')
    this.ctx.log.error(JSON.stringify(result))
    throw result
  }

  /**
   * 读取单个文件信息（含 base64 content 与 sha）。
   * 文件不存在时 Forgejo 返回 404（走 catch）。
   */
  async getFileInfo(fileName): Promise<any> {
    const url = this.fileOptions(fileName)
    const params: any = {
      method: 'GET',
      json: true,
      resolveWithFullResponse: true,
      url: url,
      qs: { ref: this.branch },
      headers: this.authHeaders()
    }
    let result: any = await this.ctx.Request.request(params)
    if (result && result.statusCode === 200) {
      return result.body
    }
    throw result
  }

  async getDataJson(): Promise<{ lastSync: string, data: any[], sha?: string }> {
    const defaultRet = {
      lastSync: '',
      data: []
    }
    try {
      const info = await this.getFileInfo('data.json')
      // Forgejo 文件内容以 base64 放在 content 字段
      const buf = Buffer.from(info.content || '', 'base64')
      const json = JSON.parse(buf.toString())
      return {
        ...defaultRet,
        ...json,
        sha: info.sha
      }
    } catch (e) {
      // 404 等一律视为还没有 data.json
      return defaultRet
    }
  }

  async updateDataJson({ data, sha }) {
    const fileName = 'data.json'
    const url = this.fileOptions(fileName)
    const params: any = {
      method: 'PUT',
      json: true,
      resolveWithFullResponse: true,
      url: url,
      headers: this.authHeaders(),
      body: {
        message: `Sync dataJson by PicGo at ${getNow()}`,
        content: Buffer.from(JSON.stringify(data)).toString('base64'),
        branch: this.branch,
        sha
      }
    }
    let result: any = await this.ctx.Request.request(params)
    if (result && result.statusCode === 200) {
      return true
    }
    this.ctx.log.error('sync update data.json error')
    this.ctx.log.error(JSON.stringify(result))
    throw result
  }

  async createDataJson(data) {
    const fileName = 'data.json'
    const url = this.fileOptions(fileName)
    const params: any = {
      method: 'POST',
      json: true,
      resolveWithFullResponse: true,
      url: url,
      headers: this.authHeaders(),
      body: {
        message: `Sync dataJson by PicGo at ${getNow()}`,
        content: Buffer.from(JSON.stringify(data)).toString('base64'),
        branch: this.branch
      }
    }
    try {
      let result: any = await this.ctx.Request.request(params)
      if (result && (result.statusCode === 201 || result.statusCode === 200)) {
        return true
      }
      this.ctx.log.error('sync data.json error')
      this.ctx.log.error(JSON.stringify(result))
      throw result
    } catch (e) {
      // 已存在则改为更新（Forgejo 对重复创建返回 409）
      if (e && e.statusCode === 409) {
        const info = await this.getFileInfo(fileName)
        return this.updateDataJson({ data, sha: info.sha })
      }
      throw e
    }
  }

  /**
   * 上传：Forgejo 创建文件用 POST（GitHub 为 PUT），成功返回 201。
   * 文件已存在（409）时自动转为更新（带 sha 的 PUT），避免重名直接失败。
   */
  async upload(img: IImgInfo) {
    const { fileName } = img
    const url = this.fileOptions(fileName)
    const body = {
      message: `Upload ${fileName} by picGo - ${getNow()}`,
      content: img.base64Image || Buffer.from(img.buffer).toString('base64'),
      branch: this.branch
    }
    const params: any = {
      method: 'POST',
      json: true,
      resolveWithFullResponse: true,
      url: url,
      headers: this.authHeaders(),
      body
    }
    try {
      const result: any = await this.ctx.Request.request(params)
      return this.pickResult(result)
    } catch (e) {
      if (e && e.statusCode === 409) {
        const info = await this.getFileInfo(fileName)
        const putParams: any = {
          ...params,
          method: 'PUT',
          body: { ...body, sha: info.sha }
        }
        const result: any = await this.ctx.Request.request(putParams)
        return this.pickResult(result)
      }
      this.ctx.log.error('upload error')
      throw e
    }
  }

  pickResult(result: any) {
    if (result && (result.statusCode === 201 || result.statusCode === 200)) {
      const content = result.body.content
      return {
        imgUrl: content.download_url || this.parseUrl(content.name),
        sha: content.sha
      }
    }
    this.ctx.log.error('upload error')
    this.ctx.log.error(JSON.stringify(result))
    throw result
  }

  async removeFile(img: ImgType) {
    const url = this.fileOptions(img.fileName)
    let sha = img.sha
    if (!sha) {
      // 老记录没有 sha 时先查一次
      const info = await this.getFileInfo(img.fileName).catch(() => null)
      sha = info && info.sha
    }
    const params: any = {
      method: 'DELETE',
      json: true,
      resolveWithFullResponse: true
      ,
      url: url,
      headers: this.authHeaders(),
      body: {
        message: `Deleted ${img.fileName} by picGo - ${getNow()}`,
        sha,
        branch: this.branch
      }
    }
    let result: any = await this.ctx.Request.request(params)
    if (result && result.statusCode === 200) {
      return true
    }
    this.ctx.log.error('deleted error')
    this.ctx.log.error(JSON.stringify(result))
    return result
  }

  fileOptions = function (fileName) {
    return encodeURI(urlJoin(
      this.baseUrl,
      'repos',
      this.owner,
      this.repo,
      'contents',
      this.path,
      fileName
    ))
  }

  parseUrl(fileName) {
    const { owner, repo, path, customUrl, branch } = this
    if (customUrl) {
      return urlJoin(customUrl, path, fileName)
    }
    // Codeberg 原始文件直链格式带 /raw/branch/
    return urlJoin(
      `https://codeberg.org/`,
      owner,
      repo,
      'raw',
      'branch',
      branch,
      path,
      fileName
    )
  }
}

let ins: Codeberg = null
let _cacheOption: string = ''
export function getIns(config: PluginConfig, ctx: IPicGo): Codeberg {
  const str = JSON.stringify(config)
  if (ins && _cacheOption === str) return ins
  _cacheOption = str
  ins = new Codeberg(config, ctx)
  return ins
}

/* istanbul ignore next */
export function clearIns() {
  // just for test
  ins = null
}
