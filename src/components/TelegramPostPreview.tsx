import React from 'react';
import { Eye, CheckCheck, Tag, ExternalLink, Share2, CornerUpRight } from 'lucide-react';
import { ProductCampaign } from '../types';

interface TelegramPostPreviewProps {
  campaign: ProductCampaign;
}

export const TelegramPostPreview: React.FC<TelegramPostPreviewProps> = ({ campaign }) => {
  const timeString = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-[#17212b] border border-[#232e3c] rounded-2xl p-4 text-[#f5f5f5] shadow-2xl relative overflow-hidden font-sans">
      
      {/* Mock Telegram Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#232e3c]/60 text-xs text-[#6c7883]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></div>
          <span className="font-semibold text-[#8e98a2]">پیش‌نمایش زنده پست در تلگرام</span>
        </div>
        <span className="bg-[#242f3d] px-2 py-0.5 rounded-full text-[10px] text-[#6c7883]">گروه هدف</span>
      </div>

      {/* Chat Background Bubble */}
      <div className="mt-3.5 bg-[#1e2c3a] border border-[#2b3a4a] rounded-2xl overflow-hidden max-w-sm mx-auto shadow-lg transition-all hover:border-[#38495a]">
        
        {/* Product Image */}
        {campaign.imageUrl ? (
          <div className="relative aspect-video bg-[#182533] overflow-hidden group">
            <img
              src={campaign.imageUrl}
              alt={campaign.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-bold text-white border border-white/10 flex items-center gap-1">
              <Tag className="w-3 h-3 text-emerald-400" />
              {campaign.price}
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-[#182533] flex items-center justify-center text-xs text-[#6c7883]">
            بدون عکس
          </div>
        )}

        {/* Post Content */}
        <div className="p-3.5 space-y-2.5 text-xs text-[#e1e9f0] leading-relaxed">
          
          {/* Title */}
          <div className="font-bold text-sm text-white flex items-center gap-1.5">
            <span>📌</span>
            <span>{campaign.title || 'عنوان محصول شما'}</span>
          </div>

          {/* Price */}
          <div className="text-emerald-400 font-semibold flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg w-fit">
            <span>💰 قیمت:</span>
            <span>{campaign.price || 'توافقی'}</span>
          </div>

          {/* Description */}
          <div className="whitespace-pre-wrap text-[#c2d1e0] text-xs pt-1 border-t border-[#2b3a4a]/60">
            {campaign.description || 'توضیحات و خصوصیات محصول شما در این قسمت نمایش داده می‌شود.'}
          </div>

          {/* Contact Link */}
          {campaign.contactHandle && (
            <div className="pt-2 flex items-center gap-1.5 font-bold text-sky-400 hover:underline">
              <span>👤 سفارش و پشتیبانی:</span>
              <span className="dir-ltr text-sky-300">{campaign.contactHandle}</span>
            </div>
          )}

          {/* Hashtags */}
          {campaign.hashtags && campaign.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 text-sky-400 text-[11px] font-medium">
              {campaign.hashtags.map((tag, idx) => (
                <span key={idx}>
                  {tag.startsWith('#') ? tag : '#' + tag}
                </span>
              ))}
            </div>
          )}

          {/* Telegram Footer Info (Views + Time + Read receipts) */}
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#6c7883] pt-2 border-t border-[#2b3a4a]/40">
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3 text-[#6c7883]" />
              <span>۱۲۴</span>
            </div>
            <span>•</span>
            <span>{timeString}</span>
            <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
          </div>

        </div>

      </div>

    </div>
  );
};
