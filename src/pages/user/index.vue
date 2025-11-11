<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAuthStore } from "@/stores/auth.ts";
import { useRouter } from "vue-router";
import BaseButton from "@/components/BaseButton.vue";
import Toast from "@/components/base/toast/Toast.ts";
import { uploadImportData, getProgress } from "@/apis/index.ts";

const authStore = useAuthStore();
const router = useRouter();

// 页面状态
const isLoading = ref(false);

// 同步数据状态
const isSyncing = ref(false);
const uploadPercent = ref(0);
const progressText = ref("等待上传...");
const syncStatus = ref<number | null>(null); // 0=导入中,1=完成,2=失败
const syncReason = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);

// 退出登录
const handleLogout = async () => {
  isLoading.value = true;
  try {
    await authStore.logout();
  } finally {
    isLoading.value = false;
  }
};

// 跳转到设置页面
const goToSettings = () => {
  router.push("/setting");
};

onMounted(() => {
  if (!authStore.isLoggedIn) {
    return;
  }
  if (!authStore.user) {
    authStore.fetchUserInfo();
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const resetSync = () => {
  isSyncing.value = false;
  uploadPercent.value = 0;
  progressText.value = "等待上传...";
  syncStatus.value = null;
  syncReason.value = "";
};

const handleSyncClick = () => {
  fileInputRef.value?.click();
};

const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // 重置，便于重复选择同一文件
  if (!file) return;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || (ext !== "zip" && ext !== "json")) {
    Toast.warning("仅支持上传 zip 或 json 文件");
    return;
  }

  try {
    isSyncing.value = true;
    progressText.value = "上传中...";

    const formData = new FormData();
    formData.append("file", file);

    await uploadImportData(formData, (event: ProgressEvent) => {
      if (event.total) {
        uploadPercent.value = Math.round((event.loaded / event.total) * 100);
      }
    });

    progressText.value = "导入中...";

    // 轮询导入进度，直到 status != 0
    while (true) {
      const res = await getProgress();
      const { status, reason } = res as any; // http 封装返回结构按实际为准
      syncStatus.value = status;
      syncReason.value = reason || "";

      if (status !== 0) break;
      await sleep(1000);
    }

    if (syncStatus.value === 1) {
      uploadPercent.value = 100;
      progressText.value = "导入完成";
      Toast.success("数据同步成功");
    } else if (syncStatus.value === 2) {
      progressText.value = "导入失败";
      Toast.error(syncReason.value || "导入失败");
    }
  } catch (err: any) {
    progressText.value = "上传或导入失败";
    Toast.error(err?.message || "上传失败");
  } finally {
    // 保留结果展示片刻，再复位
    setTimeout(() => resetSync(), 1500);
  }
};
</script>

<template>
  <div class="user-page">
    <div class="profile-card">
      <div class="profile-header">
        <div class="avatar-wrap">
          <div class="avatar ring">
            <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" alt="头像" />
            <div v-else class="avatar-placeholder">
              {{ authStore.user?.nickname?.charAt(0) || "U" }}
            </div>
          </div>
        </div>
        <div class="headline">
          <h2>{{ authStore.user?.nickname || "用户" }}</h2>
          <p v-if="authStore.user?.email">{{ authStore.user.email }}</p>
          <p v-if="authStore.user?.phone">{{ authStore.user.phone }}</p>
        </div>
      </div>

      <div class="actions">
        <BaseButton
          class="w-full"
          size="large"
          type="primary"
          :disabled="isSyncing"
          @click="handleSyncClick"
        >
          同步数据
        </BaseButton>

        <BaseButton class="w-full" size="large" @click="goToSettings">
          系统设置
        </BaseButton>

        <BaseButton
          class="w-full"
          size="large"
          type="info"
          :loading="isLoading"
          @click="handleLogout"
        >
          退出登录
        </BaseButton>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept=".zip,.json"
        class="hidden"
        @change="onFileSelected"
      />

      <div v-if="isSyncing" class="sync-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: uploadPercent + '%' }"></div>
        </div>
        <div class="progress-text">
          <span>{{ progressText }}</span>
          <span v-if="syncStatus === 2 && syncReason" class="reason">{{ syncReason }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}

.profile-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.profile-header {
  position: relative;
  padding: 2.25rem 2rem 1.5rem;
  background: linear-gradient(135deg, #6b73ff 0%, #000dff 100%);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  overflow: hidden;
  background: #fff1;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.ring {
  position: relative;
}
.ring::before {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fff, rgba(255, 255, 255, 0.2));
  -webkit-mask: radial-gradient(circle at center, transparent 62%, #000 63%);
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 2rem;
  font-weight: bold;
}

.headline h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.6rem;
  font-weight: 700;
}
.headline p {
  margin: 0.1rem 0;
  opacity: 0.9;
}

.actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.9rem;
  padding: 1.25rem;
}

.sync-progress {
  padding: 0 1.25rem 1.25rem;
}
.progress-bar {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #f1f2f6;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6b73ff 0%, #00d4ff 100%);
  transition: width 0.3s ease;
}
.progress-text {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: #444;
}
.reason {
  color: #d33;
}

.hidden {
  display: none;
}
</style>
