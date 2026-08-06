'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthToken } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';
  
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const endpoint = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/signup';
      const baseUrl = API_BASE_URL;
      
      let res;
      if (isLogin) {
        // OAuth2PasswordRequestForm expects form-encoded data
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString()
        });
      } else {
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, email, password })
        });
      }
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || '인증에 실패했습니다.');
      }
      
      const data = await res.json();
      setAuthToken(data.access_token);
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message || '인증 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f8fd] via-[#f1f4fb] to-[#e8ebf8] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      
      {/* Background Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[var(--color-primary)] rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-[2rem] p-8 border border-white/60 relative z-10" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)' }}>
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: 'linear-gradient(135deg, rgba(53,37,205,0.1), rgba(53,37,205,0.05))' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 1" }}>
              {isLogin ? 'lock' : 'person_add'}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-on-surface)' }}>
            {isLogin ? '로그인' : '회원가입'}
          </h1>
          <p className="text-sm mt-3" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isLogin ? '절세택시의 모든 기능을 이용해보세요.' : '1초 만에 가입하고 최적의 절세 경로를 찾아보세요.'}
          </p>
        </div>

        <div key={isLogin ? 'login' : 'signup'} className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="animate-in fade-in zoom-in duration-300">
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
                  이름
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                  className="w-full px-4 py-3.5 rounded-xl text-sm transition-all bg-white"
                  style={{
                    border: '1px solid rgba(199,196,216,0.4)',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(53,37,205,0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(199,196,216,0.4)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  placeholder="홍길동"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
                이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3.5 rounded-xl text-sm transition-all bg-white"
                style={{
                  border: '1px solid rgba(199,196,216,0.4)',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(53,37,205,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(199,196,216,0.4)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                placeholder="example@tax.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3.5 rounded-xl text-sm transition-all bg-white"
                style={{
                  border: '1px solid rgba(199,196,216,0.4)',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(53,37,205,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(199,196,216,0.4)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-100 animate-in fade-in">
                <p className="text-sm text-red-600 font-medium text-center">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-sm mt-4 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), #4c3ce6)',
                color: 'white',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? (isLogin ? '로그인 중...' : '가입 처리 중...') : (isLogin ? '로그인' : '회원가입 시작하기')}
            </button>
          </form>
        </div>

        <div className="mt-8 pt-6 text-center border-t border-gray-100">
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            {isLogin ? '아직 절세택시 회원이 아니신가요?' : '이미 계정이 있으신가요?'}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm font-bold mt-2 transition-colors hover:opacity-80"
            style={{ color: 'var(--color-primary)' }}
          >
            {isLogin ? '무료로 회원가입하기' : '기존 계정으로 로그인하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
