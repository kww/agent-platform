import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Workflow, 
  PlayCircle, 
  Settings 
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '仪表盘' },
  { path: '/workflows', icon: Workflow, label: '工作流' },
  { path: '/executions', icon: PlayCircle, label: '执行记录' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Workflow className="w-6 h-6 text-primary-600" />
          Agent Runtime
        </h1>
        <p className="text-xs text-gray-500 mt-1">工作流管理平台</p>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <button className="flex items-center gap-3 px-4 py-2 w-full text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Settings className="w-5 h-5" />
          设置
        </button>
      </div>
    </aside>
  );
};
