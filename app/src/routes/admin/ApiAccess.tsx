import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ChargeWidget from "@/components/admin/ChargeWidget.tsx";
import { ApiGroup, ApiRecord, ApiUsageSummary } from "@/api/api-console.ts";
import {
  deleteAdminApiGroup,
  getAdminApiUsage,
  listAdminApiGroups,
  listAdminApiRecords,
  setAdminApiGroup,
} from "@/admin/api/api-console.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Badge } from "@/components/ui/badge.tsx";
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
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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

const blankGroup: ApiGroup = {
  id: "",
  name: "",
  channel_group: "",
  ratio: 1,
  enabled: true,
  min_level: 0,
  description: "",
};

function AdminApiAccess() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [summary, setSummary] = useState<ApiUsageSummary>({ today_requests: 0, month_requests: 0, today_tokens: 0, month_tokens: 0, today_quota: 0, month_quota: 0, series: [] });
  const [groupDialog, setGroupDialog] = useState(false);
  const [groupForm, setGroupForm] = useState<ApiGroup>(blankGroup);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [username, setUsername] = useState("");
  const [model, setModel] = useState("");

  const refreshGroups = async () => {
    const result = await listAdminApiGroups();
    if (result.status) setGroups(result.data || []);
  };

  const refreshRecords = async () => {
    const [recordResult, usageResult] = await Promise.all([
      listAdminApiRecords(page, username, model),
      getAdminApiUsage(),
    ]);
    if (recordResult.status) {
      setRecords(recordResult.data.records || []);
      setTotal(recordResult.data.total || 0);
    }
    if (usageResult.status) setSummary(usageResult.data);
  };

  useEffect(() => { refreshGroups(); refreshRecords(); }, [page]);

  const saveGroup = async () => {
    const result = await setAdminApiGroup(groupForm);
    if (!result.status) return toast.error(result.error || t("error"));
    setGroupDialog(false);
    await refreshGroups();
  };

  const removeGroup = async (id: string) => {
    if (!window.confirm(t("apiConsole.deleteConfirm"))) return;
    const result = await deleteAdminApiGroup(id);
    if (!result.status) return toast.error(result.error || t("error"));
    await refreshGroups();
  };

  return (
    <motion.div
      className="w-full min-w-0 p-4 md:p-6 space-y-4 md:space-y-6"
      variants={apiPageVariants}
      initial={reducedMotion ? false : "hidden"}
      animate="visible"
    >
      <motion.div variants={apiItemVariants}><h1 className="text-2xl font-bold">{t("apiAdmin.title")}</h1><p className="text-sm text-muted-foreground mt-1">{t("apiAdmin.subtitle")}</p></motion.div>
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3" variants={apiStaggerVariants}>
        {[
          [t("apiConsole.todayRequests"), summary.today_requests],
          [t("apiConsole.monthRequests"), summary.month_requests],
          [t("apiConsole.monthTokens"), summary.month_tokens.toLocaleString()],
          [t("apiConsole.monthQuota"), summary.month_quota.toFixed(4)],
        ].map(([title, value]) => (
          <motion.div
            key={String(title)}
            variants={apiItemVariants}
            whileHover={reducedMotion ? undefined : apiCardHover}
            className="h-full"
          >
            <Card className="h-full transition-shadow duration-300 hover:shadow-md"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="text-xl font-semibold mt-1">{value}</p></CardContent></Card>
          </motion.div>
        ))}
      </motion.div>
      <motion.div variants={apiSectionVariants}>
        <Tabs defaultValue="pricing" className="w-full min-w-0">
        <TabsList><TabsTrigger value="pricing">{t("apiAdmin.pricing")}</TabsTrigger><TabsTrigger value="groups">{t("apiAdmin.groups")}</TabsTrigger><TabsTrigger value="records">{t("apiAdmin.records")}</TabsTrigger></TabsList>
        <TabsContent value="pricing"><ApiTabMotion><Card><CardHeader><CardTitle>{t("apiAdmin.pricingTitle")}</CardTitle></CardHeader><CardContent><ChargeWidget scope="api" /></CardContent></Card></ApiTabMotion></TabsContent>
        <TabsContent value="groups"><ApiTabMotion><Card><CardHeader className="flex-row items-center"><CardTitle>{t("apiAdmin.groupsTitle")}</CardTitle><Button className="ml-auto" size="sm" onClick={() => { setGroupForm({ ...blankGroup }); setGroupDialog(true); }}><Plus className="h-4 w-4 mr-1" />{t("apiAdmin.createGroup")}</Button></CardHeader><CardContent>
          <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>{t("apiConsole.name")}</TableHead><TableHead>{t("apiAdmin.channelGroup")}</TableHead><TableHead>{t("apiAdmin.ratio")}</TableHead><TableHead>{t("apiAdmin.minLevel")}</TableHead><TableHead>{t("apiConsole.status")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {groups.map((group) => <TableRow key={group.id}><TableCell className="font-mono">{group.id}</TableCell><TableCell>{group.name}</TableCell><TableCell>{group.channel_group || t("apiAdmin.followUser")}</TableCell><TableCell>× {group.ratio}</TableCell><TableCell>{group.min_level}</TableCell><TableCell><Badge variant={group.enabled ? "default" : "secondary"}>{group.enabled ? t("apiConsole.enabled") : t("apiConsole.disabled")}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon-sm" variant="outline" onClick={() => { setGroupForm({ ...group }); setGroupDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon-sm" variant="destructive" disabled={group.id === "default"} onClick={() => removeGroup(group.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent></Card></ApiTabMotion></TabsContent>
        <TabsContent value="records"><ApiTabMotion><Card><CardHeader><CardTitle>{t("apiAdmin.recordsTitle")}</CardTitle></CardHeader><CardContent>
          <div className="flex gap-2 mb-4"><Input placeholder={t("apiAdmin.searchUser")} value={username} onChange={(e) => setUsername(e.target.value)} /><Input placeholder={t("apiConsole.model")} value={model} onChange={(e) => setModel(e.target.value)} /><Button variant="outline" onClick={() => { setPage(1); refreshRecords(); }}><Search className="h-4 w-4 mr-1" />{t("apiAdmin.search")}</Button></div>
          <Table><TableHeader><TableRow><TableHead>{t("apiConsole.time")}</TableHead><TableHead>{t("apiAdmin.user")}</TableHead><TableHead>{t("apiConsole.keyName")}</TableHead><TableHead>{t("apiConsole.model")}</TableHead><TableHead>Token</TableHead><TableHead>{t("apiConsole.cost")}</TableHead><TableHead>{t("apiConsole.duration")}</TableHead><TableHead>{t("apiConsole.status")}</TableHead></TableRow></TableHeader><TableBody>
            {records.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("apiConsole.noRecords")}</TableCell></TableRow> : records.map((record) => <TableRow key={record.id}><TableCell className="text-xs">{record.created_at}</TableCell><TableCell>{record.username}</TableCell><TableCell>{record.key_name}</TableCell><TableCell>{record.model}</TableCell><TableCell>{record.input_tokens + record.output_tokens}</TableCell><TableCell>{record.quota.toFixed(4)}</TableCell><TableCell>{record.duration.toFixed(2)}s</TableCell><TableCell><Badge variant={record.status === "success" ? "default" : "destructive"}>{record.status}</Badge></TableCell></TableRow>)}
          </TableBody></Table>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("previous")}</Button><span className="text-sm py-2">{page} / {Math.max(1, Math.ceil(total / 20))}</span><Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>{t("next")}</Button></div>
        </CardContent></Card></ApiTabMotion></TabsContent>
        </Tabs>
      </motion.div>

      <Dialog open={groupDialog} onOpenChange={setGroupDialog}><DialogContent><DialogHeader><DialogTitle>{t("apiAdmin.groupEditor")}</DialogTitle><DialogDescription>{t("apiAdmin.groupTip")}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2"><div className="space-y-2"><Label>ID</Label><Input disabled={groups.some((g) => g.id === groupForm.id)} value={groupForm.id} onChange={(e) => setGroupForm({ ...groupForm, id: e.target.value })} /></div><div className="space-y-2"><Label>{t("apiConsole.name")}</Label><Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} /></div><div className="space-y-2"><Label>{t("apiAdmin.channelGroup")}</Label><Input placeholder="normal/basic/standard/pro" value={groupForm.channel_group} onChange={(e) => setGroupForm({ ...groupForm, channel_group: e.target.value })} /></div><div className="space-y-2"><Label>{t("apiAdmin.ratio")}</Label><Input type="number" min={0.01} step={0.01} value={groupForm.ratio} onChange={(e) => setGroupForm({ ...groupForm, ratio: Number(e.target.value) })} /></div><div className="space-y-2"><Label>{t("apiAdmin.minLevel")}</Label><Input type="number" min={0} max={3} value={groupForm.min_level} onChange={(e) => setGroupForm({ ...groupForm, min_level: Number(e.target.value) })} /></div><div className="flex items-center gap-2 pt-7"><Switch checked={groupForm.enabled} onCheckedChange={(value) => setGroupForm({ ...groupForm, enabled: value })} /><Label>{t("apiConsole.enabled")}</Label></div><div className="space-y-2 col-span-2"><Label>{t("description")}</Label><Input value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} /></div></div>
        <DialogFooter><Button variant="outline" onClick={() => setGroupDialog(false)}>{t("cancel")}</Button><Button disabled={!groupForm.id.trim() || !groupForm.name.trim() || groupForm.ratio <= 0} onClick={saveGroup}>{t("save")}</Button></DialogFooter>
      </DialogContent></Dialog>
    </motion.div>
  );
}

export default AdminApiAccess;
