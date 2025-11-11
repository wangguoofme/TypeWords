<script setup lang="tsx">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import BaseInput from "@/components/base/BaseInput.vue";
import BaseButton from "@/components/BaseButton.vue";
import { APP_NAME } from "@/config/env.ts";
import { useAuthStore } from "@/stores/auth.ts";
import { sendCode } from "@/apis/user.ts";
import { validateEmail, validatePhone } from "@/utils/validation.ts";
import Toast from "@/components/base/toast/Toast.ts";
import FormItem from "@/components/base/form/FormItem.vue";
import Form from "@/components/base/form/Form.vue";
import Notice from "@/pages/user/Notice.vue";
import { FormInstance } from "@/components/base/form/types.ts";
import { PASSWORD_CONFIG, PHONE_CONFIG } from "@/config/auth.ts";

// 状态管理
const authStore = useAuthStore()
const route = useRoute()

// 页面状态
let currentMode = $ref<'login' | 'register' | 'forgot'>('login')
let loginType = $ref<'code' | 'password'>('code') // 默认验证码登录
let isLoading = $ref(false)
let isSendingCode = $ref(false)
let codeCountdown = $ref(0)
let showWechatQR = $ref(true)
let wechatQRUrl = $ref('https://open.weixin.qq.com/connect/qrcode/041GmMJM2wfM0w3D')
// 微信二维码状态：idle-正常/等待扫码，scanned-已扫码待确认，expired-已过期，cancelled-已取消
let qrStatus = $ref<'idle' | 'scanned' | 'expired' | 'cancelled'>('idle')
let qrExpireTimer: ReturnType<typeof setTimeout> | null = null
let qrCheckInterval: ReturnType<typeof setInterval> | null = null
const QR_EXPIRE_TIME = 5 * 60 * 1000 // 5分钟过期

const codeRules = [
  {required: true, message: '请输入验证码', trigger: 'blur'},
  {min: PHONE_CONFIG.codeLength, message: `请输入 ${PHONE_CONFIG.codeLength} 位验证码`, trigger: 'blur'},
]
const accountRules = [
  {required: true, message: '请输入手机号/邮箱地址', trigger: 'blur'},
  {
    validator: (rule: any, value: any) => {
      if (!validatePhone(value) && !validateEmail(value)) {
        throw new Error('请输入有效的手机号或邮箱地址')
      }
    }, trigger: 'blur'
  },
]
const phoneRules = [
  {required: true, message: '请输入手机号', trigger: 'blur'},
  {
    validator: (rule: any, value: any) => {
      if (!validatePhone(value)) {
        throw new Error('请输入有效的手机号')
      }
    }, trigger: 'blur'
  },
]
const passwordRules = [
  {required: true, message: '请输入密码', trigger: 'blur'},
  {
    min: PASSWORD_CONFIG.minLength,
    max: PASSWORD_CONFIG.maxLength,
    message: `密码长度为 ${PASSWORD_CONFIG.minLength}-${PASSWORD_CONFIG.maxLength} 位`,
    trigger: 'blur'
  },
]


let phoneLoginForm = $ref({phone: '', code: ''})
let phoneLoginFormRef = $ref<FormInstance>()
let phoneLoginFormRules = {
  phone: phoneRules,
  code: codeRules
}


let loginForm2 = $ref({account: '', password: ''})
let loginForm2Ref = $ref<FormInstance>()
let loginForm2Rules = {
  account: accountRules,
  password: passwordRules,
}


const registerForm = $ref({
  phone: '',
  password: '',
  confirmPassword: '',
  code: ''
})
let registerFormRef = $ref<FormInstance>()
// 注册表单规则和引用
let registerFormRules = {
  phone: phoneRules,
  code: codeRules,
  password: passwordRules,
  confirmPassword: [
    {required: true, message: '请再次输入密码', trigger: 'blur'},
    {
      validator: (rule: any, value: any) => {
        if (value !== registerForm.password) {
          throw new Error('两次密码输入不一致')
        }
      }, trigger: 'blur'
    },
  ],
}


const forgotForm = $ref({
  account: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})
let forgotFormRef = $ref<FormInstance>()
// 忘记密码表单规则和引用
let forgotFormRules = {
  account: accountRules,
  code: codeRules,
  newPassword: passwordRules,
  confirmPassword: [
    {required: true, message: '请再次输入新密码', trigger: 'blur'},
    {
      validator: (rule: any, value: any) => {
        if (value !== forgotForm.newPassword) {
          throw new Error('两次密码输入不一致')
        }
      }, trigger: 'blur'
    },
  ],
}

// 表单数据
const loginForm = $ref({
  account: '', // 支持邮箱或手机号
  password: ''
})

const currentFormRef = $computed<FormInstance>(() => {
  if (currentMode === 'login') {
    if (loginType == 'code') return phoneLoginFormRef
    else return loginForm2Ref
  } else if (currentMode === 'register') return registerFormRef
  else return forgotFormRef
})

// 发送验证码
async function sendVerificationCode(phone: string, type: 'login' | 'register' | 'reset_password', fileName: string) {
  let res = currentFormRef.validateField(fileName)
  if (res) {
    try {
      isSendingCode = true
      const response = await sendCode({phone, type})
      if (response.success) {
        Toast.success('验证码已发送')
        codeCountdown = PHONE_CONFIG.sendInterval
        const timer = setInterval(() => {
          codeCountdown--
          if (codeCountdown <= 0) {
            clearInterval(timer)
          }
        }, 1000)
      } else {
        Toast.error(response.msg || '发送失败')
      }
    } catch (error) {
      console.error('Send code error:', error)
      Toast.error('发送验证码失败')
    } finally {
      isSendingCode = false
    }
  }
}

// 统一登录处理
async function handleLogin() {
  currentFormRef.validate(async (valid) => {
    if (!valid) return;
    //手机号登录
    if (loginType === 'code') {
      await authStore.login({
        phone: phoneLoginForm.phone,
        code: phoneLoginForm.code,
        type: 'code'
      })
    } else {
      await authStore.login({
        account: loginForm.account,
        password: loginForm.password,
        type: 'pwd'
      })
    }
  })
}

// 注册
async function handleRegister() {
  registerFormRef.validate(async (valid) => {
    if (!valid) return
    await authStore.register({
      phone: registerForm.phone,
      password: registerForm.password,
      code: registerForm.code,
      nickname: undefined,
      email: undefined
    })
  })
}

// 忘记密码
async function handleForgotPassword() {
  forgotFormRef.validate(async (valid) => {
    if (!valid) return
    const response = await authStore.resetPassword({
      phone: forgotForm.account,
      email: undefined,
      code: forgotForm.code,
      newPassword: forgotForm.newPassword
    })
    if (response.success) {
      Toast.success('密码重置成功，请重新登录')
      switchMode('login')
    } else {
      Toast.error(response.msg || '重置失败')
    }
  })
}

// 清除二维码相关定时器
function clearQRTimers() {
  if (qrExpireTimer) {
    clearTimeout(qrExpireTimer)
    qrExpireTimer = null
  }
  if (qrCheckInterval) {
    clearInterval(qrCheckInterval)
    qrCheckInterval = null
  }
}

// 刷新二维码
async function refreshQRCode() {
  clearQRTimers()
  qrStatus = 'idle'
  await handleWechatLogin()
}

// 微信登录 - 显示二维码
async function handleWechatLogin() {
  try {
    showWechatQR = true
    qrStatus = 'idle'

    // 这里应该调用后端获取二维码
    // const response = await getWechatQR()
    // wechatQRUrl = response.qrUrl

    // 暂时使用占位二维码
    wechatQRUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSI+55So5o6l566h55CG6L295Lit6K+B77yBPC90ZXh0Pgo8L3N2Zz4K'

    // 模拟轮询检查扫码状态
    qrCheckInterval = setInterval(async () => {
      // 这里应该轮询后端检查扫码状态
      // const result = await checkWechatLoginStatus()
      // if (result.scanned) qrStatus = 'scanned'
      // if (result.success) {
      //   clearQRTimers()
      //   showWechatQR = false
      //   qrStatus = 'idle'
      //   // 登录成功处理
      // }
    }, 2000)

    // 设置二维码过期
    qrExpireTimer = setTimeout(() => {
      qrStatus = 'expired'
      clearInterval(qrCheckInterval!)
      qrCheckInterval = null
      Toast.info('二维码已过期，请点击刷新')
    }, QR_EXPIRE_TIME)

  } catch (error) {
    console.error('Wechat login error:', error)
    Toast.error('微信登录失败')
  }
}

// 切换模式
function switchMode(mode: 'login' | 'register' | 'forgot') {
  currentMode = mode
  // 切换到注册或忘记密码模式时，隐藏微信扫码
  if (mode === 'register' || mode === 'forgot') {
    if (showWechatQR) {
      clearQRTimers()
      showWechatQR = false
      qrStatus = 'idle'
    }
  }
}

// 用户主动取消登录（示例：可在需要的地方调用）
function cancelWechatLogin() {
  qrStatus = 'cancelled'
}

// 初始化页面
onMounted(() => {
  // 检查是否有重定向地址
  const redirect = route.query.redirect as string
  if (redirect) {
    // 如果有重定向地址，可以显示提示信息
    Toast.info('请先登录后再访问该页面')
  }
})

// 组件卸载时清理定时器
onBeforeUnmount(() => {
  clearQRTimers()
})
</script>

<template>
  <div class="center min-h-screen">
    <div class="rounded-2xl p-2 bg-white shadow-lg">
      <!-- 登录区域容器 - 弹框形式 -->
      <div class="flex gap-2">
        <!-- 左侧登录区域 -->
        <div class="flex-1 w-80 p-6">
          <!-- 登录选项 -->
          <div v-if="currentMode === 'login'">
            <div class="mb-6 text-center text-2xl font-bold">{{ APP_NAME }}</div>

            <!-- Tab切换 -->
            <div class="center gap-8 mb-6">
              <div
                  class="center cp transition-colors"
                  :class="loginType === 'code' ? 'link font-medium' : 'text-gray-600'"
                  @click="loginType = 'code'"
              >
                <div>
                  <span>验证码登录</span>
                  <div
                      v-opacity="loginType === 'code'"
                      class="mt-1 h-0.5 bg-blue-600"
                  ></div>
                </div>
              </div>
              <div
                  class="center cp transition-colors"
                  :class="loginType === 'password' ? 'link font-medium' : 'text-gray-600'"
                  @click="loginType = 'password'"
              >
                <div>
                  <span>密码登录</span>
                  <div
                      v-opacity="loginType === 'password'"
                      class="mt-1 h-0.5 bg-blue-600"
                  ></div>
                </div>
              </div>
            </div>

            <!-- 验证码登录表单 -->
            <Form
                v-if="loginType === 'code'"
                ref="phoneLoginFormRef"
                :rules="phoneLoginFormRules"
                :model="phoneLoginForm">
              <FormItem prop="phone">
                <BaseInput v-model="phoneLoginForm.phone"
                           type="tel"
                           size="large"
                           placeholder="请输入手机号"
                />
              </FormItem>
              <FormItem prop="code">
                <div class="flex gap-2">
                  <BaseInput
                      v-model="phoneLoginForm.code"
                      type="text"
                      size="large"
                      :max-length="PHONE_CONFIG.codeLength"
                      placeholder="请输入验证码"
                  />
                  <BaseButton
                      @click="sendVerificationCode(phoneLoginForm.phone, 'login','phone')"
                      :disabled="isSendingCode || codeCountdown > 0"
                      type="info"
                      size="large"
                      style="border: 1px solid var(--color-input-border)"
                  >
                    {{ codeCountdown > 0 ? `${codeCountdown}s` : (isSendingCode ? '发送中' : '发送验证码') }}
                  </BaseButton>
                </div>
              </FormItem>
            </Form>

            <!-- 密码登录表单 -->
            <Form
                v-else
                ref="loginForm2Ref"
                :rules="loginForm2Rules"
                :model="loginForm2">
              <FormItem prop="account">
                <BaseInput v-model="loginForm2.account"
                           type="text"
                           size="large"
                           placeholder="请输入手机号/邮箱地址"
                />
              </FormItem>
              <FormItem prop="password">
                <div class="flex gap-2">
                  <BaseInput
                      v-model="loginForm2.password"
                      type="password"
                      size="large"
                      placeholder="请输入密码"
                  />
                </div>
              </FormItem>
            </Form>

            <Notice>
              <span v-if="loginType === 'code'">，未注册的手机号将自动注册</span>
            </Notice>

            <BaseButton
                class="w-full"
                size="large"
                :loading="authStore.isLoading"
                @click="handleLogin"
            >
              登录
            </BaseButton>

            <!-- 底部操作链接 - 只在密码登录时显示 -->
            <div class="mt-4 flex justify-between text-sm" v-opacity="loginType !== 'code'">
              <div class="link cp" @click="switchMode('forgot')">忘记密码?</div>
              <div class="link cp" @click="switchMode('register')">注册账号</div>
            </div>
          </div>

          <!-- 注册模式 -->
          <div v-else-if="currentMode === 'register'">
            <div class="mb-6 text-xl font-bold text-center">注册新账号</div>
            <Form
                ref="registerFormRef"
                :rules="registerFormRules"
                :model="registerForm">
              <FormItem prop="phone">
                <BaseInput
                    v-model="registerForm.phone"
                    type="tel"
                    size="large"
                    placeholder="请输入手机号"
                />
              </FormItem>
              <FormItem prop="code">
                <div class="flex gap-2">
                  <BaseInput
                      v-model="registerForm.code"
                      type="text"
                      size="large"
                      placeholder="请输入验证码"
                      :max-length="PHONE_CONFIG.codeLength"
                  />
                  <BaseButton
                      @click="sendVerificationCode(registerForm.phone, 'register','phone')"
                      :disabled="isSendingCode || codeCountdown > 0"
                      type="info"
                      size="large"
                      style="border: 1px solid var(--color-input-border)"
                  >
                    {{ codeCountdown > 0 ? `${codeCountdown}s` : (isSendingCode ? '发送中' : '获取验证码') }}
                  </BaseButton>
                </div>
              </FormItem>
              <FormItem prop="password">
                <BaseInput
                    v-model="registerForm.password"
                    type="password"
                    size="large"
                    :placeholder="`请设置密码（${PASSWORD_CONFIG.minLength}-${PASSWORD_CONFIG.maxLength} 位）`"
                />
              </FormItem>
              <FormItem prop="confirmPassword">
                <BaseInput
                    v-model="registerForm.confirmPassword"
                    type="password"
                    size="large"
                    placeholder="请再次输入密码"
                />
              </FormItem>
            </Form>

            <Notice/>

            <BaseButton
                class="w-full"
                size="large"
                :loading="authStore.isLoading"
                @click="handleRegister"
            >
              注册
            </BaseButton>

            <div class="mt-4 text-center">
              <div class="color-link cp hover:opacity-80 text-sm" @click="switchMode('login')">返回登录
              </div>
            </div>
          </div>

          <!-- 忘记密码模式 -->
          <div v-else-if="currentMode === 'forgot'">
            <div class="mb-6 text-xl font-bold text-center">重置密码</div>
            <Form
                ref="forgotFormRef"
                :rules="forgotFormRules"
                :model="forgotForm">
              <FormItem prop="account">
                <BaseInput
                    v-model="forgotForm.account"
                    type="tel"
                    size="large"
                    placeholder="请输入手机号/邮箱地址"
                />
              </FormItem>
              <FormItem prop="code">
                <div class="flex gap-2">
                  <BaseInput
                      v-model="forgotForm.code"
                      type="text"
                      size="large"
                      placeholder="请输入验证码"
                      :max-length="PHONE_CONFIG.codeLength"
                  />
                  <BaseButton
                      @click="sendVerificationCode(forgotForm.account, 'reset_password','account')"
                      :disabled="isSendingCode || codeCountdown > 0"
                      type="info"
                      size="large"
                      style="border: 1px solid var(--color-input-border)"
                  >
                    {{ codeCountdown > 0 ? `${codeCountdown}s` : (isSendingCode ? '发送中' : '获取验证码') }}
                  </BaseButton>
                </div>
              </FormItem>
              <FormItem prop="newPassword">
                <BaseInput
                    v-model="forgotForm.newPassword"
                    type="password"
                    size="large"
                    :placeholder="`请输入新密码（${PASSWORD_CONFIG.minLength}-${PASSWORD_CONFIG.maxLength} 位）`"
                />
              </FormItem>
              <FormItem prop="confirmPassword">
                <BaseInput
                    v-model="forgotForm.confirmPassword"
                    type="password"
                    size="large"
                    placeholder="请再次输入新密码"
                />
              </FormItem>
            </Form>

            <BaseButton
                class="w-full mt-2"
                size="large"
                :loading="authStore.isLoading"
                @click="handleForgotPassword"
            >
              重置密码
            </BaseButton>

            <div class="mt-4 text-center">
              <div class="color-link cp hover:opacity-80 text-sm" @click="switchMode('login')">返回登录
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧微信二维码 - 只在登录模式时显示 -->
        <div v-if="currentMode === 'login'" class="center flex-col bg-gray-100 rounded-xl px-12">
          <div class="relative w-40 h-40 bg-white rounded-xl overflow-hidden shadow-xl">
            <img
                v-if="showWechatQR"
                :src="wechatQRUrl"
                alt="微信登录二维码"
                class="w-full h-full"
                :class="{ 'opacity-30': qrStatus === 'expired' }"
            />
            <!-- 扫描成功蒙层 -->
            <div
                v-if="qrStatus === 'scanned'"
                class="absolute left-0 top-0 w-full h-full center flex-col gap-space bg-white"
            >
              <IconFluentCheckmarkCircle20Filled class="color-green text-4xl"/>
              <div class="text-base text-gray-700 font-medium">扫描成功</div>
              <div class="text-xs text-gray-600">微信中轻触允许即可登录</div>
            </div>
            <!-- 取消登录蒙层 -->
            <div
                v-if="qrStatus === 'cancelled'"
                class="absolute left-0 top-0 w-full h-full center flex-col gap-space bg-white"
            >
              <IconFluentErrorCircle20Regular class="color-red text-4xl"/>
              <div class="text-base text-gray-700 font-medium">你已取消此次登录</div>
              <div class="text-xs text-gray-600">你可<span class="color-link" @click="refreshQRCode">再次登录</span>，或关闭窗口
              </div>
            </div>
            <!-- 过期蒙层 -->
            <div
                v-if=" qrStatus === 'expired'"
                class="absolute top-0 left-0 right-0 bottom-0 bg-opacity-95 center backdrop-blur-sm"
            >
              <IconFluentArrowClockwise20Regular
                  @click="refreshQRCode"
                  class="cp text-4xl"/>
            </div>
          </div>
          <p class="mt-4 center gap-space">
            <IconIxWechatLogo class="text-xl color-green"/>
            <span class="text-sm text-gray-600">微信扫码登录</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
</style>
