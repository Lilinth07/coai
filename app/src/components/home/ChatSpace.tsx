import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { ArrowRight, ArrowUp, Megaphone, Search } from "lucide-react";
import { motion } from "framer-motion";
import { selectAuthenticated } from "@/store/auth.ts";
import {
  infoAnnouncementSelector,
  infoAuthFooterSelector,
  infoBroadcastSelector,
  infoFooterSelector,
} from "@/store/info.ts";
import {
  selectModel,
  selectSupportModels,
  setModel,
} from "@/store/chat.ts";
import Markdown from "@/components/Markdown.tsx";
import Clickable from "@/components/ui/clickable";
import Announcement from "@/components/app/Announcement";
import ChatInput from "@/components/home/assemblies/ChatInput.tsx";
import FileAction from "@/components/FileProvider.tsx";
import { FileArray } from "@/api/file.ts";
import { ModelArea } from "@/components/home/ModelArea.tsx";
import { WebAction } from "@/components/home/assemblies/ChatAction.tsx";
import { VoiceAction } from "@/components/VoiceProvider.tsx";
import ModelAvatar from "@/components/ModelAvatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { appName } from "@/conf/env.ts";
import router from "@/router.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
import { getMemory, setMemory } from "@/utils/memory.ts";

const START_TAGLINES = [
  "让每一个想法，都有回应",
  "和 AI 一起探索灵感",
  "从一句话开始，创造更多可能",
  "写作、绘图与思考，一站完成",
];

const ANNOUNCEMENT_READ_KEY = "home_announcement_read";

function announcementFingerprint(content: string): string {
  let hash = 2166136261;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${content.length}:${hash >>> 0}`;
}

function Footer() {
  const auth = useSelector(selectAuthenticated);
  const footer = useSelector(infoFooterSelector);
  const authFooter = useSelector(infoAuthFooterSelector);

  if (auth && authFooter) return null;

  return (
    footer.length > 0 && (
      <Markdown
        className="whitespace-pre-wrap text-secondary text-xs md:text-sm rounded-md bg-background/10"
        acceptHtml={true}
      >
        {footer}
      </Markdown>
    )
  );
}

type ChatSpaceProps = {
  files: FileArray;
  fileDispatch: (action: Record<string, any>) => void;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  target: React.RefObject<HTMLTextAreaElement>;
};

function ChatSpace({
  files,
  fileDispatch,
  input,
  setInput,
  onSend,
  target,
}: ChatSpaceProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const auth = useSelector(selectAuthenticated);
  const currentModel = useSelector(selectModel);
  const supportModels = useSelector(selectSupportModels);
  const announcement = useSelector(infoAnnouncementSelector);
  const broadcast = useSelector(infoBroadcastSelector);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementRead, setAnnouncementRead] = useState(false);
  const [typedTagline, setTypedTagline] = useState("");

  const announcementContent = useMemo(
    () =>
      [announcement.trim(), broadcast.message.trim()]
        .filter((content) => content.length > 0)
        .join("\n"),
    [announcement, broadcast.message],
  );
  const announcementId = useMemo(
    () => announcementFingerprint(announcementContent),
    [announcementContent],
  );
  const hasAnnouncement = announcementContent.length > 0;
  const hasUnreadAnnouncement = hasAnnouncement && !announcementRead;

  useEffect(() => {
    setAnnouncementRead(
      !hasAnnouncement || getMemory(ANNOUNCEMENT_READ_KEY) === announcementId,
    );
  }, [announcementId, hasAnnouncement]);

  useEffect(() => {
    let phraseIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timer: number | undefined;

    const tick = () => {
      const phrase = START_TAGLINES[phraseIndex];
      if (!deleting) {
        characterIndex += 1;
        setTypedTagline(phrase.slice(0, characterIndex));
        if (characterIndex >= phrase.length) {
          deleting = true;
          timer = window.setTimeout(tick, 1800);
          return;
        }
      } else {
        characterIndex -= 1;
        setTypedTagline(phrase.slice(0, characterIndex));
        if (characterIndex <= 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % START_TAGLINES.length;
          timer = window.setTimeout(tick, 450);
          return;
        }
      }

      timer = window.setTimeout(tick, deleting ? 42 : 82);
    };

    timer = window.setTimeout(tick, 250);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const quickModels = useMemo(() => {
    const available = supportModels.filter((model) => auth || !model.auth);
    const selected = available.find((model) => model.id === currentModel);
    const ordered = selected
      ? [selected, ...available.filter((model) => model.id !== selected.id)]
      : available;

    return ordered.slice(0, 3);
  }, [auth, currentModel, supportModels]);

  function handleAnnouncementOpenChange(open: boolean) {
    setAnnouncementOpen(open);
    if (!open && hasUnreadAnnouncement) {
      setMemory(ANNOUNCEMENT_READ_KEY, announcementId);
      setAnnouncementRead(true);
    }
  }

  return (
    <motion.div
      className="chat-product chat-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="chat-start-shell"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="chat-start-brand select-none">
          <div>
            <h1>{appName}</h1>
            <p className="chat-start-tagline">
              <span>{typedTagline}</span>
              <span className="chat-start-caret" aria-hidden="true" />
            </p>
          </div>
        </div>

        <div className="chat-start-models">
          {quickModels.map((model) => (
            <button
              type="button"
              key={model.id}
              className={cn(
                "chat-start-model",
                model.id === currentModel && "active",
              )}
              onClick={() => dispatch(setModel(model.id))}
            >
              <ModelAvatar size={22} model={model} />
              <span>{model.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="chat-start-model search"
            title={t("market.model")}
            onClick={() => router.navigate("/model")}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="chat-start-composer">
          <ChatInput
            className="chat-start-input border-0 bg-transparent"
            target={target}
            value={input}
            onValueChange={setInput}
            onEnterPressed={onSend}
          />
          <div className="chat-start-actions">
            <div className="flex items-center">
              <ModelArea />
              <WebAction />
              <FileAction files={files} dispatch={fileDispatch} />
              <VoiceAction />
            </div>
            <Button
              size="icon-sm"
              className="chat-start-send rounded-full"
              disabled={!input.trim().length}
              title={t("send")}
              onClick={onSend}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="chat-start-announcement select-none">
          <Megaphone className="h-3.5 w-3.5" />
          <span>{t("new-announcement")}</span>
          <Clickable
            tapScale={0.92}
            className="inline-flex items-center"
            onClick={() => handleAnnouncementOpenChange(true)}
          >
            <span>{t("learn-more")}</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Clickable>
        </div>
        <Announcement
          open={announcementOpen}
          setOpen={handleAnnouncementOpenChange}
        >
          <button
            type="button"
            className={cn(
              "chat-start-announcement-status",
              hasUnreadAnnouncement && "unread",
            )}
          >
            <span>
              {hasUnreadAnnouncement
                ? t("announcement-unread", {
                    defaultValue: "您有一条公告待查看",
                  })
                : t("announcement-read", {
                    defaultValue: "没有新的公告",
                  })}
            </span>
            {hasUnreadAnnouncement && (
              <span className="chat-start-announcement-dot" aria-hidden />
            )}
          </button>
        </Announcement>
      </motion.div>

      <motion.div
        className="space-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <Footer />
      </motion.div>
    </motion.div>
  );
}

export default ChatSpace;
