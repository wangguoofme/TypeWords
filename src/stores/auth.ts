import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  loginApi,
  registerApi,
  logoutApi,
  getUserInfo,
  resetPasswordApi,
  type LoginParams,
  type RegisterParams
} from '@/apis/user.ts'
import Toast from '@/components/base/toast/Toast.ts'
import router from '@/router.ts'

export interface User {
  id: string
  email?: string
  phone?: string
  nickname?: string
  avatar?: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('token') || '')
  const user = ref<User | null>(null)
  const isLoading = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  // 设置token
  const setToken = (newToken: string) => {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  // 清除token
  const clearToken = () => {
    token.value = ''
    localStorage.removeItem('token')
    user.value = null
  }

  // 设置用户信息
  const setUser = (userInfo: User) => {
    user.value = userInfo
  }

  // 登录
  const login = async (params: LoginParams) => {
    try {
      isLoading.value = true
      const response = await loginApi(params)
      if (response.success) {
        setToken(response.data.token)
        setUser(response.data.user)
        Toast.success('登录成功')
        // 跳转到首页或用户中心
        router.push('/')
        return true
      } else {
        Toast.error(response.msg || '登录失败')
        return false
      }
    } catch (error) {
      console.error('Login error:', error)
      Toast.error('登录失败，请重试')
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 登出
  const logout = async () => {
    try {
      await logoutApi()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearToken()
      Toast.success('已退出登录')
      router.push('/')
    }
  }

  // 获取用户信息
  const fetchUserInfo = async () => {
    try {
      const response = await getUserInfo()
      if (response.success) {
        setUser(response.data)
        return true
      }
      return false
    } catch (error) {
      console.error('Get user info error:', error)
      return false
    }
  }

  // 注册
  const register = async (params: RegisterParams) => {
    try {
      isLoading.value = true
      const response = await registerApi(params)

      if (response.success && response.data) {
        setToken(response.data.token)
        setUser(response.data.user)
        Toast.success('注册成功')

        // 跳转到首页或用户中心
        router.push('/')
        return true
      } else {
        Toast.error(response.msg || '注册失败')
        return false
      }
    } catch (error) {
      console.error('Register error:', error)
      Toast.error('注册失败，请重试')
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 重置密码
  const resetPassword = async (params: { email?: string; phone: string; code: string; newPassword: string }) => {
    try {
      isLoading.value = true
      const response = await resetPasswordApi(params)

      if (response.success) {
        Toast.success('密码重置成功')
        return {success: true, msg: '密码重置成功'}
      } else {
        return {success: false, msg: response.msg || '重置失败'}
      }
    } catch (error) {
      console.error('Reset password error:', error)
      return {success: false, msg: '重置密码失败，请重试'}
    } finally {
      isLoading.value = false
    }
  }

  // 初始化用户状态
  const initAuth = async () => {
    if (token.value) {
      const success = await fetchUserInfo()
      if (!success) {
        clearToken()
      }
      return success
    }
    return false
  }

  return {
    token,
    user,
    isLoading,
    isLoggedIn,
    setToken,
    clearToken,
    setUser,
    login,
    register,
    resetPassword,
    logout,
    fetchUserInfo,
    initAuth
  }
})
