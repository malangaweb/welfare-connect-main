import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { buildSmsPreview, getRawTemplate, normalizeSmsRecipients, SmsRecipient, SmsTriggerKey, smsTemplates } from '@/lib/smsMessaging';

type ComposerPayload = {
  triggerKey: SmsTriggerKey;
  message: string;
  recipients: SmsRecipient[];
};

type SmsMessageComposerProps = {
  recipients: SmsRecipient[];
  audienceLabel: string;
  audienceDescription?: string;
  onSend: (payload: ComposerPayload) => Promise<void>;
  isSending?: boolean;
  compact?: boolean;
  showRecipientCount?: boolean;
};

const TAGS = ['{name}', '{memberNumber}', '{balance}', '{amount}', '{caseNumber}', '{deadline}'] as const;

function buildContextFromRecipient(first: SmsRecipient | null) {
  return {
    audienceCount: first ? 1 : 0,
    memberName: first?.name || 'member',
    memberNumber: first?.memberNumber || 'M-0000',
    caseNumber: first?.caseNumber || 'CASE-001',
    amount: first?.amount || '0',
    deadline: first?.deadline || 'N/A',
    balance: '{balance}',
  };
}

export function SmsMessageComposer({
  recipients,
  audienceLabel,
  audienceDescription,
  onSend,
  isSending = false,
  compact = false,
  showRecipientCount = true,
}: SmsMessageComposerProps) {
  const normalizedRecipients = useMemo(() => normalizeSmsRecipients(recipients), [recipients]);
  const [activeTab, setActiveTab] = useState<'triggers' | 'custom'>('triggers');
  const [triggerKey, setTriggerKey] = useState<SmsTriggerKey>('welcome_member');
  const [customMessage, setCustomMessage] = useState('');

  const firstRecipient = normalizedRecipients[0] || null;
  const previewContext = useMemo(
    () => buildContextFromRecipient(firstRecipient),
    [firstRecipient],
  );

  const previewMessage = activeTab === 'triggers'
    ? buildSmsPreview(triggerKey, previewContext)
    : customMessage.trim();

  const handleSend = async () => {
    const message = activeTab === 'triggers'
      ? getRawTemplate(triggerKey)
      : customMessage.trim();

    if (!normalizedRecipients.length || !message) {
      return;
    }

    await onSend({
      triggerKey: activeTab === 'triggers' ? triggerKey : 'manual_custom',
      message,
      recipients: normalizedRecipients,
    });
  };

  return (
    <Card className={cn('border-slate-200 shadow-sm', compact && 'shadow-none')}>
      <CardHeader className={cn('space-y-2', compact ? 'pb-3' : 'pb-4')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base md:text-lg">Message composer</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {audienceDescription || `Compose an SMS for ${audienceLabel}.`}
            </CardDescription>
          </div>
          {showRecipientCount && (
            <Badge variant="secondary" className="h-fit">
              {normalizedRecipients.length.toLocaleString()} recipients
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'triggers' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="triggers">Triggers</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="triggers" className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2">
              {smsTemplates
                .filter((template) => template.key !== 'manual_custom')
                .map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => setTriggerKey(template.key)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      triggerKey === template.key
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{template.label}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {template.category}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{template.description}</p>
                  </button>
                ))}
            </div>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                {previewMessage || 'Pick a trigger to preview the message.'}
              </p>
              {firstRecipient && (
                <p className="mt-1 text-xs text-slate-400">
                  Preview uses data from: {firstRecipient.name || firstRecipient.phoneNumber}
                  {firstRecipient.name ? ` (${firstRecipient.phoneNumber})` : ''}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="custom-message">Custom message</Label>
              <Textarea
                id="custom-message"
                value={customMessage}
                onChange={(event) => setCustomMessage(event.target.value)}
                placeholder="Write your custom SMS here. You can use tags that will be replaced per-recipient:"
                rows={5}
              />
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer text-[10px] font-mono text-slate-500 hover:text-primary hover:border-primary"
                    onClick={() => setCustomMessage((prev) => `${prev}${tag} `)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Tags are replaced per-recipient with their actual data. {`{balance}`} is fetched from their wallet.
              </p>
            </div>
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                {customMessage.trim() || 'Your custom message preview will appear here.'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                In preview tags are shown as-is. Recipients will get their own values.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">{audienceLabel}</p>
            <p className="text-xs text-slate-500">
              {normalizedRecipients.length
                ? `Ready to send to ${normalizedRecipients.length.toLocaleString()} recipient${normalizedRecipients.length === 1 ? '' : 's'}.`
                : 'No recipients selected yet.'}
            </p>
          </div>
          <Button onClick={() => void handleSend()} disabled={isSending || normalizedRecipients.length === 0 || !previewMessage.trim()}>
            {isSending ? 'Sending...' : 'Send message'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
