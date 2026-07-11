import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { quotaSelector, refreshQuota } from "@/store/quota.ts";
import { AppDispatch } from "@/store";
import { Cloud, ExternalLink, Gift } from "lucide-react";
import { docsEndpoint } from "@/conf/env.ts";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useRedeem as redeemCode } from "@/api/redeem.ts";
import { motion } from "framer-motion";
import { infoPaymentSelector } from "@/store/info.ts";
import { createPaymentOrder, usePaymentState } from "@/payment/request.ts";
import { PaymentButton } from "@/payment/icons.tsx";
import QuotaWrapper from "@/routes/wallet/AmountItem.tsx";

const BUILTIN_AMOUNTS = [10, 20, 50, 100, 200];

export default function WalletQuotaBox() {
  const { t } = useTranslation();
  const quota = useSelector(quotaSelector);
  const paymentMethods = useSelector(infoPaymentSelector);
  const [redeemOpen, setRedeemOpen] = useState(false);

  // Online top-up state
  const [selectedAmountIdx, setSelectedAmountIdx] = useState(0);
  const [customAmount, setCustomAmount] = useState(BUILTIN_AMOUNTS[0] * 10);
  const [selectedMethod, setSelectedMethod] = useState("");
  useEffect(() => {
    if (!selectedMethod && paymentMethods.length > 0) {
      setSelectedMethod(paymentMethods[0]);
    }
  }, [paymentMethods, selectedMethod]);
  const [paying, setPaying] = useState(false);
  const [currentOrder, setCurrentOrder] = useState("");

  // Auto-detect payment state
  const orderPaid = usePaymentState(currentOrder);
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    if (orderPaid) {
      dispatch(refreshQuota());
      toast.success(t("buy.payment-success"));
    }
  }, [orderPaid, dispatch, t]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.1,
        when: "beforeChildren",
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const handlePay = async () => {
    if (!selectedMethod || customAmount <= 0) return;
    const quotaAmount = customAmount;
    setPaying(true);
    const res = await createPaymentOrder(selectedMethod, quotaAmount, `TUC${quotaAmount}`);
    if (res.status && res.data) {
      setCurrentOrder(res.data.params?.out_trade_no || "");

      if (res.data.params && res.data.url) {
        // Create a form and POST to the payment URL
        const form = document.createElement("form");
        form.method = "POST";
        form.action = res.data.url;
        form.style.display = "none";
        form.acceptCharset = "utf-8";

        Object.entries(res.data.params).forEach(([key, value]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = value as string;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      }
    } else {
      toast.error(t("buy.payment-failed"), {
        description: res.error,
      });
    }
    setPaying(false);
  };

  const handleAmountChange = (index: number) => {
    setSelectedAmountIdx(index);
    if (index < BUILTIN_AMOUNTS.length) {
      setCustomAmount(BUILTIN_AMOUNTS[index] * 10);
    }
  };

  const showOnlineTopup = paymentMethods.length > 0;

  return (
    <motion.div
      className={`w-full h-fit md:mt-4`}
      id={`quota`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <RedeemComponent open={redeemOpen} onOpenChanged={setRedeemOpen} />
      <motion.div className={`flex flex-col pb-4`} variants={itemVariants}>
        <motion.div className={`dialog-wrapper`} variants={itemVariants}>
          <motion.div className={`buy-interface`} variants={itemVariants}>
            <motion.div
              className={`w-full h-fit mt-0 border rounded-lg p-2.5 bg-background flex flex-col md:flex-row`}
              variants={itemVariants}
            >
              <motion.div
                className="flex flex-col w-full md:w-1/2 p-2.5 pb-4 md:pb-2.5 border-b md:border-r md:border-b-0"
                variants={itemVariants}
              >
                <motion.div
                  className="text-xs text-secondary mb-1"
                  variants={itemVariants}
                >
                  {t("buy.title")}
                </motion.div>
                <motion.div
                  className="text-2xl font-medium mb-1 jetbrains-mono"
                  variants={itemVariants}
                >
                  <Cloud className={`h-4 w-4 mr-1 inline-block`} />
                  {quota.toFixed(2)}
                </motion.div>
                <motion.div
                  className={`text-xs text-secondary mt-auto break-all whitespace-pre-wrap`}
                  variants={itemVariants}
                >
                  {t("buy.quota-info")}
                  <a
                    href={docsEndpoint}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sky-500 hover:text-sky-600"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-0.5 ml-1 inline-block" />
                    {t("buy.learn-more")}
                  </a>
                </motion.div>
              </motion.div>

              <motion.div
                className="flex flex-col w-full md:w-1/2 pt-4 md:pt-0 md:pl-2"
                variants={itemVariants}
              >
                <motion.div
                  className={`flex flex-col items-center justify-center h-full`}
                  variants={itemVariants}
                >
                  <motion.div
                    className="flex flex-col space-y-2 w-full px-1"
                    variants={itemVariants}
                  >
                    <Button
                      variant="outline"
                      className="w-full transition-all hover:bg-secondary"
                      onClick={() => setRedeemOpen(true)}
                    >
                      <Gift className="h-4 w-4 mr-2" />
                      {t("buy.redeem-title")}
                    </Button>
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Online Top-up Section */}
            {showOnlineTopup && (
              <motion.div
                className={`w-full h-fit mt-3 border rounded-lg p-4 bg-background`}
                variants={itemVariants}
              >
                <motion.div className="text-sm font-medium mb-3" variants={itemVariants}>
                  {t("buy.online-topup")}
                </motion.div>

                <QuotaWrapper
                  current={selectedAmountIdx}
                  onCurrentChange={handleAmountChange}
                  amount={selectedAmountIdx < BUILTIN_AMOUNTS.length ? BUILTIN_AMOUNTS[selectedAmountIdx] : customAmount / 10}
                  onAmountChange={(amount) => setCustomAmount(amount)}
                  builtinAmount={BUILTIN_AMOUNTS}
                />

                {/* Payment method selection */}
                <div className="mt-3">
                  <div className="text-xs text-secondary mb-2">{t("buy.payment-method")}</div>
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map((method) => (
                      <PaymentButton
                        key={method}
                        method={method}
                        variant={selectedMethod === method ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedMethod(method)}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    className="w-full"
                    disabled={paying || !selectedMethod || customAmount <= 0}
                    loading={paying}
                    onClick={handlePay}
                  >
                    {t("buy.pay", { amount: customAmount })}
                  </Button>
                </div>

                {currentOrder && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {orderPaid
                      ? t("buy.payment-success")
                      : t("buy.payment-pending")}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

type RedeemComponentProps = {
  open: boolean;
  onOpenChanged: (open: boolean) => void;
};

function RedeemComponent({ open, onOpenChanged }: RedeemComponentProps) {
  const { t } = useTranslation();
  const [redeem, setRedeem] = useState("");
  const dispatch: AppDispatch = useDispatch();

  const doRedeemAction = async () => {
    if (redeem.trim() === "") return;
    const res = await redeemCode(redeem.trim());
    if (res.status) {
      toast.success(t("buy.exchange-success"), {
        description: t("buy.exchange-success-prompt", {
          amount: res.quota,
        }),
      });
      setRedeem("");
      dispatch(refreshQuota());
      onOpenChanged(false);
    } else {
      toast.error(t("buy.exchange-failed"), {
        description: t("buy.exchange-failed-prompt", {
          reason: res.error,
        }),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChanged}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("buy.redeem-title")}</DialogTitle>
          <DialogDescription>{t("buy.redeem-description")}</DialogDescription>
        </DialogHeader>
        <div className={`w-full h-fit relative`}>
          <Gift
            className={`h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2`}
          />
          <Input
            className={`redeem-input flex-grow text-center pl-10`}
            placeholder={t("buy.redeem-placeholder")}
            value={redeem}
            onChange={(e) => setRedeem(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            unClickable
            onClick={() => onOpenChanged(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            unClickable
            disabled={redeem.trim() === ""}
            loading={true}
            onClick={doRedeemAction}
          >
            {t("buy.redeem")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

