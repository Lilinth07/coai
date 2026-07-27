import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiGroup,
  ApiKey,
  ApiKeyForm,
  ApiRecord,
  ApiUsageSummary,
  createApiKey,
  deleteApiKey,
  getApiUsage,
  listApiGroups,
  listApiKeys,
  listApiPricing,
  listApiRecords,
  resetApiKey,
  updateApiKey,
} from "@/api/api-console.ts";
import { ChargeProps, tokenBilling, timesBilling } from "@/admin/charge.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import {
  ApiTabMotion,
  apiCardHover,
  apiItemVariants,
  apiPageVariants,
  apiSectionVariants,
  apiStaggerVariants,
} from "@/components/api/ApiMotion.tsx";
import {
  Activity,
  BookOpen,
  Copy,
  Gauge,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
} from "lucide-react";

const initialForm: ApiKeyForm = {
  name: "",
  disabled: false,
  expired_at: "",
  quota: 100,
  infinite_quota: true,
  ip_whitelist: "",
  model_whitelist: "",
  token_group: "default",
};

function SummaryCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={apiItemVariants}
      whileHover={reducedMotion ? undefined : apiCardHover}
      className="h-full"
    >
      <Card className="h-full transition-shadow duration-300 hover:shadow-md group">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="rounded-lg border p-2 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">{icon}</div>
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function formatTime(value?: string) {
  if (!value) return "-";
  return value.replace("T", " ").replace("Z", "");
}

function ApiConsole() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [pricing, setPricing] = useState<ChargeProps[]>([]);
  const [summary, setSummary] = useState<ApiUsageSummary>({
    today_requests: 0,
    month_requests: 0,
    today_tokens: 0,
    month_tokens: 0,
    today_quota: 0,
    month_quota: 0,
    series: [],
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [form, setForm] = useState<ApiKeyForm>(initialForm);
  const [revealedKey, setRevealedKey] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const [keyRes, groupRes, usageRes, pricingRes, recordRes] = await Promise.all([
      listApiKeys(),
      listApiGroups(),
      getApiUsage(),
      listApiPricing(),
      listApiRecords(page),
    ]);
    if (keyRes.status) setKeys(keyRes.data || []);
    if (groupRes.status) setGroups(groupRes.data || []);
    if (usageRes.status) setSummary(usageRes.data);
    if (pricingRes.status) setPricing(pricingRes.data || []);
    if (recordRes.status) {
      setRecords(recordRes.data.records || []);
      setTotal(recordRes.data.total || 0);
    }
  };

  useEffect(() => {
    refresh();
  }, [page]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...initialForm, token_group: groups[0]?.id || "default" });
    setDialogOpen(true);
  };

  const openEdit = (key: ApiKey) => {
    setEditing(key);
    setForm({
      name: key.name,
      disabled: key.disabled,
      expired_at: key.expired_at || "",
      quota: key.quota,
      infinite_quota: key.infinite_quota,
      ip_whitelist: key.ip_whitelist || "",
      model_whitelist: key.model_whitelist || "",
      token_group: key.token_group || "default",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const result = editing
      ? await updateApiKey(editing.id, form)
      : await createApiKey(form);
    setSaving(false);
    if (!result.status) {
      toast.error(result.error || t("error"));
      return;
    }
    if (!editing && result.data?.key) setRevealedKey(result.data.key);
    setDialogOpen(false);
    toast.success(t("request-success"));
    await refresh();
  };

  const remove = async (key: ApiKey) => {
    if (!window.confirm(t("apiConsole.deleteConfirm"))) return;
    const result = await deleteApiKey(key.id);
    if (!result.status) return toast.error(result.error || t("error"));
    await refresh();
  };

  const reset = async (key: ApiKey) => {
    if (!window.confirm(t("apiConsole.resetConfirm"))) return;
    const result = await resetApiKey(key.id);
    if (!result.status) return toast.error(result.error || t("error"));
    setRevealedKey(result.data.key);
    await refresh();
  };

  const maxPage = Math.max(1, Math.ceil(total / 20));
  const endpoint = useMemo(() => `${window.location.origin}/api/v1`, []);

  return (
    <ScrollArea className="w-full h-full bg-muted/25">
      <motion.div
        className="max-w-6xl mx-auto p-3 md:p-6 space-y-4"
        variants={apiPageVariants}
        initial={reducedMotion ? false : "hidden"}
        animate="visible"
      >
        <motion.div className="flex flex-wrap items-center gap-3" variants={apiItemVariants}>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <KeyRound className="h-6 w-6" /> {t("apiConsole.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t("apiConsole.subtitle")}</p>
          </div>
          <Button className="ml-auto" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> {t("apiConsole.create")}
          </Button>
        </motion.div>

        <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3" variants={apiStaggerVariants}>
          <SummaryCard title={t("apiConsole.todayRequests")} value={summary.today_requests} icon={<Activity className="h-5 w-5" />} />
          <SummaryCard title={t("apiConsole.monthRequests")} value={summary.month_requests} icon={<Gauge className="h-5 w-5" />} />
          <SummaryCard title={t("apiConsole.monthTokens")} value={summary.month_tokens.toLocaleString()} icon={<WalletCards className="h-5 w-5" />} />
          <SummaryCard title={t("apiConsole.monthQuota")} value={summary.month_quota.toFixed(4)} icon={<KeyRound className="h-5 w-5" />} />
        </motion.div>

        <motion.div variants={apiSectionVariants}>
          <Tabs defaultValue="keys">
            <TabsList className="grid grid-cols-4 w-full md:w-[520px]">
              <TabsTrigger value="keys">{t("apiConsole.keys")}</TabsTrigger>
              <TabsTrigger value="usage">{t("apiConsole.usage")}</TabsTrigger>
              <TabsTrigger value="pricing">{t("apiConsole.pricing")}</TabsTrigger>
              <TabsTrigger value="docs">{t("apiConsole.docs")}</TabsTrigger>
            </TabsList>

            <TabsContent value="keys">
              <ApiTabMotion>
                <Card>
              <CardHeader><CardTitle>{t("apiConsole.keyManagement")}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{t("apiConsole.name")}</TableHead><TableHead>{t("apiConsole.key")}</TableHead>
                    <TableHead>{t("apiConsole.group")}</TableHead><TableHead>{t("apiConsole.quota")}</TableHead>
                    <TableHead>{t("apiConsole.status")}</TableHead><TableHead>{t("apiConsole.lastUsed")}</TableHead>
                    <TableHead className="text-right">{t("apiConsole.actions")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {keys.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("apiConsole.noKeys")}</TableCell></TableRow> : keys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell className="font-mono text-xs">{key.masked_key}</TableCell>
                        <TableCell>{groups.find((g) => g.id === key.token_group)?.name || key.token_group}</TableCell>
                        <TableCell>{key.infinite_quota ? "∞" : `${key.used_quota.toFixed(2)} / ${key.quota.toFixed(2)}`}</TableCell>
                        <TableCell><Badge variant={key.disabled ? "secondary" : "default"}>{key.disabled ? t("apiConsole.disabled") : t("apiConsole.enabled")}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatTime(key.last_used_at)}</TableCell>
                        <TableCell><div className="flex justify-end gap-1">
                          <Button variant="outline" size="icon-sm" onClick={() => openEdit(key)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="outline" size="icon-sm" onClick={() => reset(key)}><RefreshCw className="h-3.5 w-3.5" /></Button>
                          <Button variant="destructive" size="icon-sm" onClick={() => remove(key)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
                </Card>
              </ApiTabMotion>
            </TabsContent>

            <TabsContent value="usage">
              <ApiTabMotion>
                <Card><CardHeader><CardTitle>{t("apiConsole.requestDetails")}</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow>
                <TableHead>{t("apiConsole.time")}</TableHead><TableHead>{t("apiConsole.keyName")}</TableHead>
                <TableHead>{t("apiConsole.model")}</TableHead><TableHead>Token</TableHead>
                <TableHead>{t("apiConsole.cost")}</TableHead><TableHead>{t("apiConsole.duration")}</TableHead><TableHead>{t("apiConsole.status")}</TableHead>
              </TableRow></TableHeader><TableBody>
                {records.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("apiConsole.noRecords")}</TableCell></TableRow> : records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-xs">{formatTime(record.created_at)}</TableCell><TableCell>{record.key_name}</TableCell>
                    <TableCell>{record.model}</TableCell><TableCell>{(record.input_tokens + record.output_tokens).toLocaleString()}</TableCell>
                    <TableCell>{record.quota.toFixed(4)}</TableCell><TableCell>{record.duration.toFixed(2)}s</TableCell>
                    <TableCell><Badge variant={record.status === "success" ? "default" : "destructive"}>{record.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
              <div className="flex justify-end items-center gap-2 mt-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("previous")}</Button>
                <span className="text-sm text-muted-foreground">{page} / {maxPage}</span>
                <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>{t("next")}</Button>
              </div>
                </CardContent></Card>
              </ApiTabMotion>
            </TabsContent>

            <TabsContent value="pricing">
              <ApiTabMotion>
                <Card><CardHeader><CardTitle>{t("apiConsole.apiPricing")}</CardTitle></CardHeader><CardContent>
              <Table><TableHeader><TableRow><TableHead>{t("apiConsole.model")}</TableHead><TableHead>{t("apiConsole.billingMode")}</TableHead><TableHead>{t("apiConsole.inputPrice")}</TableHead><TableHead>{t("apiConsole.outputPrice")}</TableHead></TableRow></TableHeader>
                <TableBody>{pricing.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("apiConsole.noPricing")}</TableCell></TableRow> : pricing.map((item) => item.models.map((model) => <TableRow key={`${item.id}-${model}`}><TableCell>{model}</TableCell><TableCell>{item.type === tokenBilling ? t("apiConsole.tokenBilling") : item.type === timesBilling ? t("apiConsole.timesBilling") : t("apiConsole.free")}</TableCell><TableCell>{item.input}</TableCell><TableCell>{item.output}</TableCell></TableRow>))}</TableBody>
              </Table>
                </CardContent></Card>
              </ApiTabMotion>
            </TabsContent>

            <TabsContent value="docs">
              <ApiTabMotion>
                <div className="grid md:grid-cols-2 gap-4">
              <Card><CardHeader><CardTitle className="flex gap-2"><BookOpen className="h-5 w-5" />{t("apiConsole.quickStart")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
                <div><Label>{t("apiConsole.endpoint")}</Label><div className="mt-1 flex"><Input readOnly value={endpoint} className="font-mono" /><Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(endpoint)}><Copy className="h-4 w-4" /></Button></div></div>
                <pre className="bg-muted rounded-lg p-3 overflow-auto text-xs">{`curl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
              </CardContent></Card>
              <Card><CardHeader><CardTitle>{t("apiConsole.compatibility")}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground space-y-2"><p>{t("apiConsole.compatibilityDesc")}</p><p>{t("apiConsole.securityTip")}</p></CardContent></Card>
                </div>
              </ApiTabMotion>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editing ? t("apiConsole.editKey") : t("apiConsole.createKey")}</DialogTitle><DialogDescription>{t("apiConsole.keyFormTip")}</DialogDescription></DialogHeader>
          <div className="grid md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>{t("apiConsole.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("apiConsole.group")}</Label><select className="w-full h-10 border rounded-md bg-background px-3 text-sm" value={form.token_group} onChange={(e) => setForm({ ...form, token_group: e.target.value })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} × {group.ratio}</option>)}</select></div>
            <div className="space-y-2"><Label>{t("apiConsole.expiredAt")}</Label><Input type="datetime-local" value={form.expired_at?.replace(" ", "T").slice(0, 16)} onChange={(e) => setForm({ ...form, expired_at: e.target.value ? e.target.value.replace("T", " ") + ":00" : "" })} /></div>
            <div className="space-y-2"><Label>{t("apiConsole.quota")}</Label><Input type="number" min={0} disabled={form.infinite_quota} value={form.quota} onChange={(e) => setForm({ ...form, quota: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.infinite_quota} onCheckedChange={(value) => setForm({ ...form, infinite_quota: value })} /><Label>{t("apiConsole.unlimited")}</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.disabled} onCheckedChange={(value) => setForm({ ...form, disabled: value })} /><Label>{t("apiConsole.disableKey")}</Label></div>
            <div className="space-y-2 md:col-span-2"><Label>{t("apiConsole.ipWhitelist")}</Label><Input placeholder="1.2.3.4, 10.0.0.0/8" value={form.ip_whitelist} onChange={(e) => setForm({ ...form, ip_whitelist: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>{t("apiConsole.modelWhitelist")}</Label><Input placeholder="gpt-4o-mini, claude-3-5-sonnet" value={form.model_whitelist} onChange={(e) => setForm({ ...form, model_whitelist: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button><Button disabled={saving || !form.name.trim()} onClick={save}>{t("save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey("")}>
        <DialogContent><DialogHeader><DialogTitle>{t("apiConsole.saveKeyNow")}</DialogTitle><DialogDescription>{t("apiConsole.onlyShownOnce")}</DialogDescription></DialogHeader>
          <div className="flex"><Input readOnly value={revealedKey} className="font-mono" /><Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(revealedKey); toast.success(t("copied")); }}><Copy className="h-4 w-4" /></Button></div>
          <DialogFooter><Button onClick={() => setRevealedKey("")}>{t("confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

export default ApiConsole;
