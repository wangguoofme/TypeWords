<script setup lang="ts">
import { onMounted, watch } from "vue";
import { BaseState, useBaseStore } from "@/stores/base.ts";
import { useRuntimeStore } from "@/stores/runtime.ts";
import { useSettingStore } from "@/stores/setting.ts";
import useTheme from "@/hooks/theme.ts";
import { shakeCommonDict } from "@/utils";
import { get, set } from 'idb-keyval'

import { useRoute } from "vue-router";
import { DictId } from "@/types/types.ts";
import { APP_VERSION, AppEnv, LOCAL_FILE_KEY, SAVE_DICT_KEY, SAVE_SETTING_KEY } from "@/config/env.ts";
import { syncSetting } from "@/apis";
import { useUserStore } from "@/stores/auth.ts";

const store = useBaseStore()
const runtimeStore = useRuntimeStore()
const settingStore = useSettingStore()
const userStore = useUserStore()
const {setTheme} = useTheme()

let lastAudioFileIdList = []
watch(store.$state, (n: BaseState) => {
  let data = shakeCommonDict(n)
  set(SAVE_DICT_KEY.key, JSON.stringify({val: data, version: SAVE_DICT_KEY.version}))

  //筛选自定义和收藏
  let bookList = data.article.bookList.filter(v => v.custom || [DictId.articleCollect].includes(v.id))
  let audioFileIdList = []
  bookList.forEach(v => {
    //筛选 audioFileId 字体有值的
    v.articles.filter(s => !s.audioSrc && s.audioFileId).forEach(a => {
      //所有 id 存起来，下次直接判断字符串是否相等，因为这个watch会频繁调用
      audioFileIdList.push(a.audioFileId)
    })
  })
  if (audioFileIdList.toString() !== lastAudioFileIdList.toString()) {
    let result = []
    //删除未使用到的文件
    get(LOCAL_FILE_KEY).then((fileList: Array<{ id: string, file: Blob }>) => {
      if (fileList && fileList.length > 0) {
        audioFileIdList.forEach(a => {
          let item = fileList.find(b => b.id === a)
          item && result.push(item)
        })
        set(LOCAL_FILE_KEY, result)
        lastAudioFileIdList = audioFileIdList
      }
    })
  }
})

watch(() => settingStore.$state, (n) => {
  set(SAVE_SETTING_KEY.key, JSON.stringify({val: n, version: SAVE_SETTING_KEY.version}))
  if (AppEnv.CAN_REQUEST) {
    syncSetting(null, settingStore.$state)
  }
}, {deep: true})

async function init() {
  await userStore.init()
  await store.init()
  await settingStore.init()
  store.load = true

  setTheme(settingStore.theme)

  if (settingStore.first) {
    set(APP_VERSION.key, APP_VERSION.version)
  } else {
    get(APP_VERSION.key).then(r => {
      runtimeStore.isNew = r ? (APP_VERSION.version > Number(r)) : true
    })
  }
  window.umami?.track('host', {host: window.location.host})
}

onMounted(init)

onMounted(() => {
  let key = 'keyval-store'

  // keys: 你想读取的 idb key 列表
  async function readIndexedDBCompatible(dbName = 'type-words', keys = [
    'type-words-app-version',
    'typing-word-dict',
    'typing-word-setting',
    'typing-word-files'
  ]) {
    // 尝试打开数据库；如果不存在则会触发 onerror 或返回空
    return new Promise((resolve, reject) => {
      const openReq = indexedDB.open(dbName);

      openReq.onerror = function () {
        // 如果按 dbName 打不开，再尝试 idb-keyval 默认 db 名：'keyval'
        tryOpenKeyvalDefault();
      };

      openReq.onsuccess = function () {
        const db = openReq.result;
        // 列出所有 objectStoreNames
        const stores = Array.from(db.objectStoreNames);
        if (stores.length === 0) {
          db.close();
          // 没有 store，尝试 idb-keyval 默认 db
          tryOpenKeyvalDefault();
          return;
        }

        // 如果只有 keyval（idb-keyval 常见情况），直接按 key 获取
        if (stores.length === 1 && stores[0] === 'keyval') {
          readFromKeyvalDB(db, keys).then(result => {
            db.close();
            resolve(result);
          }).catch(err => {
            db.close();
            reject(err);
          });
        } else {
          // 否则尝试按每个 store 名读取全部（兼容之前代码）
          readFromMultipleStores(db, stores).then(result => {
            db.close();
            resolve(result);
          }).catch(err => {
            db.close();
            reject(err);
          });
        }
      };

      function tryOpenKeyvalDefault() {
        const req2 = indexedDB.open('keyval');
        req2.onerror = function () {
          // 两种尝试都失败，返回空结果而不是抛错（容错）
          resolve({indexedDB: {}, reason: 'no-db'});
        };
        req2.onsuccess = function () {
          const db2 = req2.result;
          readFromKeyvalDB(db2, keys).then(result => {
            db2.close();
            resolve(result);
          }).catch(err => {
            db2.close();
            reject(err);
          });
        };
      }

      function readFromKeyvalDB(db, keysToRead) {
        return new Promise((res, rej) => {
          const tx = db.transaction('keyval', 'readonly');
          const store = tx.objectStore('keyval');
          const out = {};
          let done = 0;

          keysToRead.forEach(k => {
            const r = store.get(k);
            r.onsuccess = function (e) {
              out[k] = e.target.result === undefined ? null : e.target.result;
              done++;
              if (done === keysToRead.length) res({indexedDB: out});
            };
            r.onerror = function (e) {
              out[k] = null;
              done++;
              if (done === keysToRead.length) res({indexedDB: out});
            };
          });

          // 如果 keysToRead 为空，直接返回空对象
          if (keysToRead.length === 0) res({indexedDB: {}});
        });
      }

      function readFromMultipleStores(db, stores) {
        return new Promise((res, rej) => {
          const result = {};
          let idx = 0;
          stores.forEach(storeName => {
            try {
              const tx = db.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              const getAllReq = store.getAll();
              getAllReq.onsuccess = function (e) {
                result[storeName] = e.target.result;
                idx++;
                if (idx === stores.length) res({indexedDB: result});
              };
              getAllReq.onerror = function () {
                result[storeName] = [];
                idx++;
                if (idx === stores.length) res({indexedDB: result});
              };
            } catch (err) {
              // 可能 store 不存在或其它问题
              result[storeName] = [];
              idx++;
              if (idx === stores.length) res({indexedDB: result});
            }
          });
          if (stores.length === 0) res({indexedDB: {}});
        });
      }
    });
  }

// 读取 localStorage 的指定 keys
  function readLocalStorageKeys(keys = ['PracticeSaveWord', 'PracticeSaveArticle']) {
    const out = {};
    keys.forEach(k => {
      out[k] = localStorage.getItem(k);
    });
    return out;
  }

// 汇总读取：localStorage + IndexedDB（兼容 idb-keyval）
  async function readAllStorageForMigration() {
    const local = readLocalStorageKeys(['PracticeSaveWord', 'PracticeSaveArticle']);
    // 这里 dbName 传 'type-words'（你之前创建的）或也可以尝试 'keyval'，函数内部会降级尝试
    const indexed = await readIndexedDBCompatible(key, [
      'type-words-app-version',
      'typing-word-dict',
      'typing-word-setting',
      'typing-word-files'
    ]);
    return {
      localStorage: local,
      indexedDB: indexed.indexedDB || {}
    };
  }


  // if (!OLD_ORIGIN){
  //   var OLD_ORIGIN = "https://2study.top";
  // }
  // // 创建隐藏 iframe
  // const iframe = document.createElement("iframe");
  // iframe.style.display = "none";
  // iframe.src = `${OLD_ORIGIN}/migrate.html`;
  // document.body.appendChild(iframe);
  // // 接收旧域名的数据
  // window.addEventListener("message", async (event) => {
  //   if (event.data.type !== "MIGRATE_RESULT") return;
  //   const payload = event.data.payload;
  //   console.log('payload', payload)
  // });
  //
  // iframe.onload = function () {
  //   setTimeout(()=>{
  //     iframe.contentWindow.postMessage({type: "REQUEST_MIGRATION_DATA"}, OLD_ORIGIN);
  //   },3000)
  // };


// 使用示例（在老域名 2study.top 的控制台执行）：
//   readAllStorageForMigration().then(result => {
//     console.log('读取到的数据：', result);
//   }).catch(err => {
//     console.error('读取失败：', err);
//   });
})


// let transitionName = $ref('go')
// const route = useRoute()
// watch(() => route.path, (to, from) => {
//   return transitionName = ''
// console.log('watch', to, from)
// //footer下面的5个按钮，对跳不要用动画
// let noAnimation = [
//   '/pc/practice',
//   '/pc/dict',
//   '/mobile',
//   '/'
// ]
// if (noAnimation.indexOf(from) !== -1 && noAnimation.indexOf(to) !== -1) {
//   return transitionName = ''
// }
//
// const toDepth = routes.findIndex(v => v.path === to)
// const fromDepth = routes.findIndex(v => v.path === from)
// transitionName = toDepth > fromDepth ? 'go' : 'back'
// console.log('transitionName', transitionName, toDepth, fromDepth)
// })
</script>

<template>
  <!--  <router-view v-slot="{ Component }">-->
  <!--    <transition :name="transitionName">-->
  <!--      <keep-alive :exclude="runtimeStore.excludeRoutes">-->
  <!--        <component :is="Component"/>-->
  <!--      </keep-alive>-->
  <!--    </transition>-->
  <!--  </router-view>-->
  <router-view></router-view>
</template>