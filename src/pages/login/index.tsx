import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSignIn } from '@features/user-auth'
import { Avatar } from '@shared/ui/avatar'
import { TitleBar } from '@shared/ui/title-bar'
import styles from './login.module.css'

export function LoginPage() {
  const signIn = useSignIn()
  const [account, setAccount] = useState('')
  const [credential, setCredential] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (account.trim().length === 0 || credential.length === 0) return
    signIn.mutate({ account: account.trim(), credential })
  }

  return (
    <div className={styles.page}>
      <TitleBar variant="login" />
      <div className={styles.content}>
        <Avatar name="cadux" size={84} className={styles.logo} />
        <h1 className={styles.title}>cadux</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            placeholder="邮箱账号"
            value={account}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => setAccount(event.target.value)}
          />
          <input
            className={styles.input}
            type="password"
            placeholder="密码"
            value={credential}
            autoComplete="current-password"
            onChange={(event) => setCredential(event.target.value)}
          />
          {signIn.isError ? (
            <div className={styles.error}>{signIn.error instanceof Error ? signIn.error.message : '登录失败'}</div>
          ) : null}
          <button
            className={styles.submit}
            type="submit"
            disabled={signIn.isPending || account.trim().length === 0 || credential.length === 0}
          >
            {signIn.isPending ? '登录中…' : '登录'}
          </button>
        </form>
        <div className={styles.links}>
          <span>注册账号</span>
          <span>找回密码</span>
        </div>
      </div>
      <div className={styles.footer}>cadux v0.1.0</div>
    </div>
  )
}
