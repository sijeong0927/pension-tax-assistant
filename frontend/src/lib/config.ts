/**
 * config.ts
 * 프론트엔드 공통 설정 및 API BASE URL 관리
 */

export const getApiBaseUrl = (): string => {
  const envUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (envUrl) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 로컬 개발 환경(NODE_ENV === 'development') 또는 브라우저 localhost 접속 시 로컬 백엔드로 바로 연결
  if (
    process.env.NODE_ENV === 'development' ||
    (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ) {
    return 'http://localhost:8000';
  }

  return 'https://tax-i-ef90.onrender.com';
};

export const API_BASE_URL = 'http://localhost:8000';
