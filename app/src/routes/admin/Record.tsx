import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { ApiRecord, ApiUsageSummary } from "@/api/api-console.ts";
import {
  getAdminApiUsage,
  listAdminApiRecords,
} from "@/admin/api/api-console.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";

const emptySummary: ApiUsageSummary = {
  today_requests: 0,
  month_requests: 0,
  today_tokens: 0,
  month_tokens: 0,
  today_quota: 0,
  month_quota: 0,
  series: [],
};

export default function AdminRecord() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [summary, setSummary] = useState<ApiUsageSummary>(emptySummary);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [username, setUsername] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [recordResult, usageResult] = await Promise.all([
      listAdminApiRecords(page, username, model),
      getAdminApiUsage(),
    ]);
    if (recordResult.status) {
      setRecords(recordResult.data.records || []);
      setTotal(recordResult.data.total || 0);
    }
    if (usageResult.status) setSummary(usageResult.data || emptySummary);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [page]);

  const search = () => {
    if (page === 1) refresh();
    else setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="w-full min-w-0 p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("record.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("record.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          [t("record.request-today"), summary.today_requests],
          [t("record.request-month"), summary.month_requests],
          [t("record.month-tokens"), summary.month_tokens.toLocaleString()],
          [t("record.billing-month"), summary.month_quota.toFixed(4)],
        ].map(([title, value]) => (
          <Card key={String(title)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{title}</p>
              <p className="text-xl font-semibold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="w-full min-w-0">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <Input
              placeholder={t("record.cond.username-placeholder")}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && search()}
            />
            <Input
              placeholder={t("record.cond.model-placeholder")}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && search()}
            />
            <Button variant="outline" className="shrink-0 whitespace-nowrap" onClick={search}>
              <Search className="h-4 w-4 mr-1" />
              {t("record.query")}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("record.created-at")}</TableHead>
                <TableHead>{t("record.user")}</TableHead>
                <TableHead>{t("record.key-name")}</TableHead>
                <TableHead>{t("record.model")}</TableHead>
                <TableHead>{t("record.group")}</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>{t("record.quota")}</TableHead>
                <TableHead>{t("record.duration")}</TableHead>
                <TableHead>{t("record.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {t("record.no-records")}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-xs whitespace-nowrap">{record.created_at}</TableCell>
                    <TableCell>{record.username}</TableCell>
                    <TableCell>{record.key_name}</TableCell>
                    <TableCell>{record.model}</TableCell>
                    <TableCell>{record.token_group}</TableCell>
                    <TableCell>{record.input_tokens + record.output_tokens}</TableCell>
                    <TableCell>{record.quota.toFixed(4)}</TableCell>
                    <TableCell>{record.duration.toFixed(2)}s</TableCell>
                    <TableCell>
                      <Badge variant={record.status === "success" ? "default" : "destructive"}>
                        {record.status === "success" ? t("record.success") : t("record.failed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </Button>
            <span className="text-sm py-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              {t("next")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
