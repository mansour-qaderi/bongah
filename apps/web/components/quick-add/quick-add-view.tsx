'use client';

import { ClipboardPaste, FileSpreadsheet, PencilLine } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DraftGrid } from './draft-grid';
import { FileImport } from './file-import';
import { PinnedPanel } from './pinned-panel';
import { SingleForm } from './single-form';
import { SmartText } from './smart-text';

export function QuickAddView() {
  const t = useT();
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink">{t('qa.title')}</h2>
        <p className="text-[13px] text-muted">{t('qa.subtitle')}</p>
      </div>

      <PinnedPanel />

      <Tabs defaultValue="form" className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="form">
            <PencilLine aria-hidden className="h-4 w-4" />
            {t('qa.tab.form')}
          </TabsTrigger>
          <TabsTrigger value="text">
            <ClipboardPaste aria-hidden className="h-4 w-4" />
            {t('qa.tab.text')}
          </TabsTrigger>
          <TabsTrigger value="file">
            <FileSpreadsheet aria-hidden className="h-4 w-4" />
            {t('qa.tab.file')}
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

      <section id="drafts" aria-label={t('qa.drafts.aria')} className="scroll-mt-20">
        <DraftGrid />
      </section>
    </div>
  );
}
