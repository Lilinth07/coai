import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { useEffectAsync } from "@/utils/hook.ts";
import { getPaymentOrders, PaymentOrder, recheckOrderStatus } from "@/payment/request.ts";
import { getConfig, initialSystemState, setConfig, SystemProps } from "@/admin/api/system.ts";
import { withNotify } from "@/api/common.ts";
import { formReducer } from "@/utils/form.ts";
import { useReducer, useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { RefreshCw, CreditCard, Settings, Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function AdminPayment() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    const res = await getPaymentOrders(page, search);
    if (res.status) {
      setOrders(res.data);
      setTotal(res.total);
    } else {
      withNotify(t, res);
    }
    setLoading(false);
  };

  useEffectAsync(async () => {
    await fetchOrders();
  }, [page]);

  const handleRecheck = async (orderId: string) => {
    const res = await recheckOrderStatus(orderId, "epay");
    withNotify(t, res);
    if (res.status && (res as any).is_changed) {
      await fetchOrders();
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className={`flex flex-col gap-4 p-4`}>
      <EpayConfigCard />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("admin.payment.orders")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("admin.payment.search-placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    fetchOrders();
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPage(1);
                fetchOrders();
              }}
            >
              <Search className="h-4 w-4 mr-1" />
              {t("admin.payment.search")}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.payment.order-id")}</TableHead>
                <TableHead>{t("admin.payment.user")}</TableHead>
                <TableHead>{t("admin.payment.type")}</TableHead>
                <TableHead>{t("admin.payment.amount")}</TableHead>
                <TableHead>{t("admin.payment.quota")}</TableHead>
                <TableHead>{t("admin.payment.state")}</TableHead>
                <TableHead>{t("admin.payment.time")}</TableHead>
                <TableHead>{t("admin.payment.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {t("admin.payment.no-orders")}
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.order_id}>
                    <TableCell className="font-mono text-xs">{order.order_id}</TableCell>
                    <TableCell>{order.username}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.type}</Badge>
                    </TableCell>
                    <TableCell>楼{order.amount?.toFixed(2)}</TableCell>
                    <TableCell>{order.quota}</TableCell>
                    <TableCell>
                      <Badge variant={order.state ? "default" : "secondary"}>
                        {order.state
                          ? t("admin.payment.paid")
                          : t("admin.payment.pending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.created_at}
                    </TableCell>
                    <TableCell>
                      {!order.state && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRecheck(order.order_id)}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          {t("admin.payment.recheck")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t("admin.payment.total", { count: total })}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EpayConfigCard() {
  const { t } = useTranslation();
  const [config, dispatchConfig] = useReducer(formReducer<SystemProps>(), initialSystemState);
  const [loaded, setLoaded] = useState(false);

  useEffectAsync(async () => {
    const res = await getConfig();
    if (res.status && res.data) {
      dispatchConfig({ type: "set", payload: res.data });
    }
    setLoaded(true);
  }, []);

  const saveConfig = async () => {
    const res = await setConfig(config);
    withNotify(t, res);
  };

  if (!loaded) return null;

  const epay = config.payment?.epay || {
    enabled: false,
    domain: "",
    business_id: "",
    business_key: "",
    methods: ["alipay", "wxpay"],
    aggregation: false,
  };

  const updateEpay = (patch: Partial<typeof epay>) => {
    dispatchConfig({
      type: "update:payment",
      payload: {
        ...(config.payment || initialSystemState.payment),
        epay: { ...epay, ...patch },
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t("admin.payment.epay-config")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t("admin.payment.enabled")}</Label>
            <Switch
              checked={epay.enabled}
              onCheckedChange={(checked) =>
                updateEpay({ enabled: checked })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t("admin.payment.domain")}</Label>
            <Input
              value={epay.domain}
              placeholder="https://pay.example.com"
              onChange={(e) =>
                updateEpay({ domain: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t("admin.payment.business-id")}</Label>
            <Input
              value={epay.business_id}
              placeholder="PID"
              onChange={(e) =>
                updateEpay({ business_id: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t("admin.payment.business-key")}</Label>
            <Input
              type="password"
              value={epay.business_key}
              placeholder="KEY"
              onChange={(e) =>
                updateEpay({ business_key: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t("admin.payment.methods")}</Label>
            <Input
              value={Array.isArray(epay.methods) ? epay.methods.join(",") : (epay.methods || "alipay,wxpay")}
              placeholder="alipay,wxpay"
              onChange={(e) =>
                updateEpay({ methods: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t("admin.payment.aggregation")}</Label>
            <Switch
              checked={epay.aggregation}
              onCheckedChange={(checked) =>
                updateEpay({ aggregation: checked })
              }
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={saveConfig}>{t("admin.payment.save")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}


