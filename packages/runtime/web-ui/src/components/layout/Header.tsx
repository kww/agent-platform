import React from 'react';
import { Bell, Search, User } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6">
      <div className="flex items-center flex-1 max-w-xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索工作流、执行记录..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">Admin</p>
            <p className="text-xs text-gray-500">管理员</p>
          </div>
          <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-primary-600" />
          </div>
        </div>
      </div>
    </header>
  );
};
