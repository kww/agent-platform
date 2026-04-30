/**
 * 认证中间件 - Auth Middleware
 * SEC-004: agent-runtime 删除 API 权限保护
 *
 * 与 studio 共享 JWT Secret，验证同一套 token
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// JWT 配置（与 studio 一致）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[SECURITY] JWT_SECRET 环境变量未设置。请在启动前配置 JWT_SECRET。');
}

// API Key 配置（独立使用 runtime 场景）
const RUNTIME_API_KEY = process.env.RUNTIME_API_KEY;

/**
 * 扩展 Request 类型
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        sessionId: string;
        userId?: string;
        isGuest: boolean;
      };
    }
  }
}

/**
 * 验证 Token（与 studio auth/service.ts 逻辑一致）
 */
export function verifyToken(token: string): { sessionId: string; userId?: string } | null {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    
    // 验证签名
    const payloadStr = Buffer.from(encoded, 'base64url').toString('utf8');
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(payloadStr)
      .digest('hex');
    
    if (signature !== expectedSig) return null;
    
    // 解析 payload
    const payload = JSON.parse(payloadStr);
    
    // 检查过期
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return {
      sessionId: payload.sid,
      userId: payload.uid,
    };
  } catch {
    return null;
  }
}

/**
 * 验证 API Key
 */
function verifyApiKey(req: Request): boolean {
  if (!RUNTIME_API_KEY) return false;
  
  // 1. X-API-Key header
  const headerKey = req.headers['x-api-key'];
  if (headerKey && headerKey === RUNTIME_API_KEY) return true;
  
  // 2. Query parameter
  const queryKey = req.query.apiKey;
  if (queryKey && queryKey === RUNTIME_API_KEY) return true;
  
  return false;
}

/**
 * 从请求中提取 Token
 */
function extractToken(req: Request): string | null {
  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  
  // 2. Cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/auth_token=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  
  // 3. Query parameter（临时方案，用于 WebSocket 等）
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  
  return null;
}

/**
 * 认证中间件 - 验证 Token 或 API Key，注入 req.user
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. 先试 JWT token（studio 场景）
    const token = extractToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        req.user = {
          sessionId: payload.sessionId,
          userId: payload.userId,
          isGuest: !payload.userId,
        };
        return next();
      }
    }
    
    // 2. Fallback 到 API Key（独立场景）
    if (verifyApiKey(req)) {
      req.user = {
        sessionId: 'api-key',
        userId: 'runtime-admin',
        isGuest: false,
      };
      return next();
    }
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing valid token or API key',
    });
  };
}

/**
 * 非访客中间件 - 要求用户已登录（非 guest）或使用 API Key
 */
export function requireNotGuest() {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. 先试 JWT token（studio 场景）
    const token = extractToken(req);
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        // 检查是否为 Guest
        if (!payload.userId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Guest users cannot perform this operation. Please log in.',
          });
        }
        req.user = {
          sessionId: payload.sessionId,
          userId: payload.userId,
          isGuest: false,
        };
        return next();
      }
    }
    
    // 2. Fallback 到 API Key（独立场景）
    if (verifyApiKey(req)) {
      req.user = {
        sessionId: 'api-key',
        userId: 'runtime-admin',
        isGuest: false,
      };
      return next();
    }
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required for this operation',
    });
  };
}

/**
 * 可选认证 - 有 token 则验证，无 token 则通过（req.user 为 undefined）
 */
export function optionalAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }
    
    const payload = verifyToken(token);
    
    if (payload) {
      req.user = {
        sessionId: payload.sessionId,
        userId: payload.userId,
        isGuest: !payload.userId,
      };
    }
    
    next();
  };
}
