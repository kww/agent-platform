/**
 * 启动 agent-runtime HTTP 服务器
 */
import { startServer } from './server';

const PORT = parseInt(process.env.AGENT_RUNTIME_PORT || '13202', 10);

startServer(PORT);
