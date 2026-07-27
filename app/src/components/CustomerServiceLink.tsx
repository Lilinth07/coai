import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Headphones } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import customerServiceWechat from "@/assets/customer-service-wechat.jpg";
import { Button } from "@/components/ui/button.tsx";
import { infoContactSelector, infoTitleSelector } from "@/store/info.ts";
import { appName } from "@/conf/env.ts";

const Lanyard = lazy(() => import("@/components/effects/Lanyard.tsx"));

function drawCustomerCard(
  title: string,
  contact: string,
  qrImage?: HTMLImageElement,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 960;
  const context = canvas.getContext("2d");
  if (!context) return "";

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  ["#4285f4", "#ea4335", "#fbbc05", "#34a853"].forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index * 180, 0, 180, 18);
  });

  context.fillStyle = "#111827";
  context.font = "700 72px Arial, sans-serif";
  context.fillText(title || appName || "LILIN AI", 64, 170, 592);
  context.fillStyle = "#6b7280";
  context.font = "600 24px Arial, sans-serif";
  context.fillText("CUSTOMER CARE", 68, 222);

  context.fillStyle = "#f3f4f6";
  context.beginPath();
  context.roundRect(64, 270, 592, 570, 28);
  context.fill();
  context.fillStyle = "#111827";
  context.font = "700 42px Arial, sans-serif";
  context.fillText("\u5ba2\u670d\u652f\u6301", 112, 350);
  context.fillStyle = "#4b5563";
  context.font = "400 26px Arial, sans-serif";
  context.fillText(
    "\u5fae\u4fe1\u626b\u7801\u8054\u7cfb\u5ba2\u670d",
    112,
    397,
  );

  if (qrImage) {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.roundRect(166, 430, 388, 388, 16);
    context.fill();
    context.drawImage(qrImage, 160, 475, 775, 775, 178, 442, 364, 364);
  } else {
    context.fillStyle = "#d1d5db";
    context.fillRect(178, 442, 364, 364);
  }

  context.fillStyle = "#9ca3af";
  context.font = "400 22px Arial, sans-serif";
  context.fillText(contact.trim() || "LILIN AI SERVICE", 64, 900, 592);
  return canvas.toDataURL("image/png");
}

function CustomerLanyardFallback({
  setLoading,
}: {
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    setLoading(true);
    return () => setLoading(false);
  }, [setLoading]);

  return null;
}

function CustomerServiceLink() {
  const { t } = useTranslation();
  const title = useSelector(infoTitleSelector);
  const contact = useSelector(infoContactSelector);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrImage, setQrImage] = useState<HTMLImageElement>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchorX, setAnchorX] = useState(() => window.innerWidth - 28);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setQrImage(image);
    image.src = customerServiceWechat;
    return () => {
      image.onload = null;
    };
  }, []);

  const cardImage = useMemo(
    () => drawCustomerCard(title, contact, qrImage),
    [contact, qrImage, title],
  );
  const label = t("contact.service", {
    defaultValue: "\u8054\u7cfb\u5ba2\u670d",
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchorX(rect.left + rect.width / 2);
    } else {
      setLoading(false);
    }
    setOpen(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <Fragment>
      <Button
        ref={triggerRef}
        variant="outline"
        size="thin"
        unClickable
        className={`customer-service-button rounded-full${
          loading ? " is-loading" : ""
        }`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-busy={loading}
        onClick={() => handleOpenChange(!open)}
      >
        <span className="customer-service-icon" aria-hidden="true">
          <Headphones className="h-[1.05rem] w-[1.05rem]" />
        </span>
        <span>{label}</span>
      </Button>
      {open &&
        createPortal(
          <div
            className="customer-lanyard-popover"
            role="dialog"
            aria-label={label}
          >
            <Suspense
              fallback={<CustomerLanyardFallback setLoading={setLoading} />}
            >
              <Lanyard
                anchorX={anchorX}
                frontImage={cardImage}
                imageFit="cover"
              />
            </Suspense>
          </div>,
          document.body,
        )}
    </Fragment>
  );
}

export default CustomerServiceLink;
