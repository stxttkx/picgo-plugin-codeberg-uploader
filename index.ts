import { IPicGo, IPluginConfig } from 'picgo'
import { getIns } from './lib/codeberg'
import { getNow, zip, unzip } from './lib/helper'
import { ImgType, PluginConfig as PlusConfig } from './lib/interface'
const PluginName = 'picgo-plugin-codeberg-uploader'
const UploaderName = 'codeberg'
function initCodeberg(ctx: IPicGo) {
  const options: PlusConfig = ctx.getConfig('picBed.' + UploaderName)
  if (!options) {
    throw new Error("Can't find codeberg config:" + ('picBed.' + UploaderName))
  }
  const ins = getIns(options, ctx)
  return ins
}

function notic(showNotification: Function, title: string, body?: string) {
  showNotification({
    title: 'codeberg: ' + title,
    body
  })
}

const SyncMenu = {
  label: 'Sync codeberg',
  async handle(ctx: IPicGo, { showNotification }) {
    const codeberg = initCodeberg(ctx)
    notic(showNotification, 'Sync codeberg...')
    const remoteDataJson = await codeberg.getDataJson().catch(e => {
      ctx.log.error(e)
      notic(showNotification, 'Error at load dataJson', e.message)
      throw e
    })
    const uploaded: ImgType[] = ctx.getConfig<any[]>('uploaded')
    const localDataJson = {
      data: uploaded.filter(each => each.type === UploaderName).map(zip),
      lastSync: (ctx.getConfig<any>(PluginName) || {}).lastSync
    }
    const { sha, lastSync, data } = remoteDataJson
    if (localDataJson.lastSync > lastSync) {
      try {
        if (sha) {
          await codeberg.updateDataJson({
            data: localDataJson,
            sha
          })
        } else {
          await codeberg.createDataJson(localDataJson)
        }
      } catch (e) {
        ctx.log.error(e)
        notic(showNotification, 'Error at sync codeberg', e.message)
        throw e
      }
    } else {
      const newUploaded = data
        .map(each => {
          const obj = unzip(each)
          return {
            ...obj,
            type: UploaderName,
            imgUrl: codeberg.parseUrl(obj.fileName)
          }
        })
        .concat(uploaded.filter(each => each.type !== UploaderName))
      ctx.saveConfig({
        uploaded: newUploaded,
        [PluginName]: {
          lastSync
        }
      })
    }
    notic(showNotification, 'Sync successful', 'Succeed to sync codeberg')
  }
}

const PullMenu = {
  label: 'Pull codeberg',
  handle: async (ctx: IPicGo, { showNotification }) => {
    const codeberg = initCodeberg(ctx)
    notic(showNotification, 'Pull img from codeberg...')
    try {
      const entries = await codeberg.listDir()
      const imgList: ImgType[] = entries
        .filter(each => each.type === 'file' && /\.(jpg|png|jpeg|gif)$/i.test(each.name))
        .map(each => {
          const unzipImg = unzip({
            f: each.name,
            s: each.sha
          })
          return {
            ...unzipImg,
            type: UploaderName,
            imgUrl: each.download_url || codeberg.parseUrl(each.name)
          }
        })
      const uploaded: ImgType[] = ctx.getConfig<any[]>('uploaded')
        .filter(each => each.type !== UploaderName)
      uploaded.unshift(...imgList)
      ctx.saveConfig({
        uploaded,
        [PluginName]: {
          lastSync: getNow()
        }
      })
      notic(showNotification, 'Pull successful', 'Succeed to pull from codeberg')
    } catch (e) {
      ctx.log.error(e)
      notic(showNotification, 'Error at pull from codeberg', e.message)
    }
  }
}

const guiMenu = ctx => {
  return [SyncMenu, PullMenu]
}

const handle = async (ctx: IPicGo) => {
  let output = ctx.output
  const codeberg = initCodeberg(ctx)
  const ret = []
  const len = output.length
  let index = 0
  async function up() {
    const img = output[index]
    if (index >= len) return
    if (!img) {
      index++
      return up()
    }
    return codeberg
      .upload(img)
      .then(({ imgUrl, sha }) => {
        img.imgUrl = imgUrl
        img.sha = sha
        ret.push(img)
        index++
        return up()
      })
      .catch(e => {
        ctx.log.error(e)
        ctx.emit('notification', {
          title: 'codeberg: 上传失败',
          body: e && e.message ? e.message : JSON.stringify(e),
          text: ''
        })
        index++
        return up()
      })
  }
  await up()
  ctx.saveConfig({
    [PluginName]: {
      lastSync: getNow()
    }
  })
  ctx.output = ret
  return ctx
}

async function onRemove(files: ImgType[], { showNotification }) {
  const rms = files.filter(each => each.type === UploaderName)
  if (rms.length === 0) return
  const self: IPicGo = this
  const ins = initCodeberg(self)
  const fail = []
  for (let i = 0; i < rms.length; i++) {
    const each = rms[i]
    await ins.removeFile(each).catch((e) => {
      self.log.error(e)
      fail.push(each)
    })
  }
  if (fail.length) {
    // 确保主线程已经把文件从data.json删掉
    const uploaded: ImgType[] = self.getConfig('uploaded')
    uploaded.unshift(...fail)
    self.saveConfig({
      uploaded,
      [PluginName]: {
        lastSync: getNow()
      }
    })
  }
  notic(
    showNotification,
    '删除提示',
    fail.length === 0 ? '成功同步删除' : `删除失败${fail.length}个`
  )
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  let userConfig: any = ctx.getConfig(`picBed.${UploaderName}`)
  if (!userConfig) {
    userConfig = {}
  }
  const conf = [
    {
      name: 'repo',
      type: 'input',
      default: userConfig.repo || '',
      required: true
    },
    {
      name: 'branch',
      type: 'input',
      default: userConfig.branch || 'main',
      required: false
    },
    {
      name: 'token',
      type: 'input',
      default: userConfig.token || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      default: userConfig.path || '',
      required: false
    },
    {
      name: 'customPath',
      type: 'list',
      default: userConfig.customPath || '',
      required: false,
      choices: [
        {
          name: 'default',
          value: 'default'
        },
        {
          name: '年',
          value: 'year'
        },
        {
          name: '年季',
          value: 'yearQuarter'
        },
        {
          name: '年月',
          value: 'yearMonth'
        }]
    },
    {
      name: 'customUrl',
      type: 'input',
      default: userConfig.customUrl || '',
      required: false
    }
  ]
  return conf
}
const syncConfig = (ctx: IPicGo): IPluginConfig[] => {
  let userConfig: any = ctx.getConfig(PluginName)
  if (!userConfig) {
    userConfig = {}
  }
  const conf = [
    {
      name: 'lastSync',
      type: 'input',
      default: userConfig.lastSync || '',
      required: false
    }
  ]
  return conf
}

export = (ctx: IPicGo) => {
  const register = () => {
    ctx.helper.uploader.register(UploaderName, { handle, config })
    ctx.on('remove', onRemove)
  }
  return {
    register,
    guiMenu, // <-- 在这里注册
    uploader: UploaderName,
    config: syncConfig
  }
}
