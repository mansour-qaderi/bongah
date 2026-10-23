'use client';

import { ClipboardPaste, FileSpreadsheet, PencilLine } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DraftGrid } from './draft-grid';
import { FileImport } from './file-import';
import { PinnedPanel } from './pinned-panel';
import { SingleForm } from './single-form';
import { SmartText } from './smart-text';

export function QuickAddView() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink">ثبت سریع و گروهی آگهی</h2>
        <p className="text-[13px] text-muted">یک آگهی را سریع بنویسید، یا چندین آگهی را از متن پیام‌ها و فایل اکسل یک‌جا وارد کنید.</p>
      </div>

      <PinnedPanel />

      <Tabs defaultValue="form" className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="form">
            <PencilLine aria-hidden className="h-4 w-4" />
            فرم سریع
          </TabsTrigger>
          <TabsTrigger value="text">
            <ClipboardPaste aria-hidden className="h-4 w-4" />
            متن هوشمند
          </TabsTrigger>
          <TabsTrigger value="file">
            <FileSpreadsheet aria-hidden className="h-4 w-4" />
            فایل CSV / اکسل
          </TabsTrigger>
        </TabsList>
        <TabsContent value="form" className="outline-none">
          <SingleForm />
        </TabsContent>
        <TabsContent value="text" className="outline-none">
          <SmartText />
        </TabsContent>
        <TabsContent value="file" className="outline-none">
          <FileImport />
        </TabsContent>
      </Tabs>

      <section id="drafts" aria-label="پیش‌نویس‌ها" className="scroll-mt-20">
        <DraftGrid />
      </section>
    </div>
  );
}
