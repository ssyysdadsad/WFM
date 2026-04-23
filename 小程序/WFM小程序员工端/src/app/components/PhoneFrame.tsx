import React from 'react';

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="relative w-[375px] h-[812px] bg-white rounded-[40px] shadow-2xl border-[8px] border-gray-800 overflow-hidden flex flex-col">
        {/* Status Bar */}
        <div className="h-11 bg-white flex items-center justify-between px-6 shrink-0">
          <span className="text-xs font-medium">9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-2.5 flex items-end gap-[1px]">
              <div className="w-[3px] h-[40%] bg-gray-900 rounded-sm" />
              <div className="w-[3px] h-[60%] bg-gray-900 rounded-sm" />
              <div className="w-[3px] h-[80%] bg-gray-900 rounded-sm" />
              <div className="w-[3px] h-full bg-gray-900 rounded-sm" />
            </div>
            <span className="text-xs">WiFi</span>
            <div className="w-6 h-3 border border-gray-900 rounded-sm relative">
              <div className="absolute inset-[1px] right-[3px] bg-gray-900 rounded-[1px]" />
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
        {/* Home Indicator */}
        <div className="h-5 flex items-center justify-center shrink-0 bg-white">
          <div className="w-[134px] h-[5px] bg-gray-900 rounded-full" />
        </div>
      </div>
    </div>
  );
}
