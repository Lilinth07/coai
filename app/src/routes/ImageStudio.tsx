import "@/assets/pages/image-studio.less";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Image as ImageIcon,
  Maximize2,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { selectSupportModels } from "@/store/chat.ts";
import { Model } from "@/api/types.tsx";
import { generateImage } from "@/api/image.ts";
import { toast } from "sonner";

type Artwork = {
  id: string;
  src: string;
  prompt: string;
  model: string;
  createdAt: number;
  favorite: boolean;
};

const historyKey = "coai-image-studio-history";
const favoriteKey = "coai-image-studio-favorites";
const styleOptions = ["auto", "写实摄影", "数字艺术", "动漫插画", "电影概念", "水彩" ];
const qualityOptions = ["standard", "hd"];
const sizeOptions = [
  { value: "1024x1024", label: "1:1 方形" },
  { value: "1536x1024", label: "3:2 横向" },
  { value: "1024x1536", label: "2:3 纵向" },
  { value: "1792x1024", label: "16:9 宽屏" },
];

function getImageSource(data?: { url?: string; b64_json?: string }): string {
  if (data?.url) return data.url;
  if (!data?.b64_json) return "";
  return data.b64_json.startsWith("data:")
    ? data.b64_json
    : `data:image/png;base64,${data.b64_json}`;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function modelLabel(model: Model): string {
  return model.name || model.id;
}

function readFavoriteIds(): Set<string> {
  try {
    const stored = localStorage.getItem(favoriteKey) || sessionStorage.getItem(favoriteKey) || "[]";
    const value = JSON.parse(stored);
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function loadHistory(): Artwork[] {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) || "[]");
    if (!Array.isArray(value)) return [];
    const favorites = readFavoriteIds();
    return value
      .filter((item): item is Artwork => item && typeof item.id === "string" && typeof item.src === "string")
      .map((item) => ({ ...item, favorite: favorites.has(item.id) || item.favorite === true }));
  } catch {
    return [];
  }
}

function persistHistory(items: Artwork[]) {
  try {
    localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 24)));
  } catch {
    // Generated Base64 images can exceed the browser's localStorage quota.
    // Favorites are persisted separately, so a full history must not break them.
  }
}

function persistFavoriteIds(ids: Set<string>) {
  try {
    localStorage.setItem(favoriteKey, JSON.stringify(Array.from(ids)));
  } catch {
    try {
      sessionStorage.setItem(favoriteKey, JSON.stringify(Array.from(ids)));
    } catch {
      // The in-memory state still keeps the current page usable.
    }
  }
}

function ImageStudio() {
  const supportModels = useSelector(selectSupportModels);
  const imageModels = useMemo(() => {
    const tagged = supportModels.filter((model) =>
      model.tag?.includes("image-generation"),
    );
    if (tagged.length > 0) return tagged;
    return supportModels.filter((model) =>
      /dall|imagen|image/i.test(`${model.id} ${model.name}`),
    );
  }, [supportModels]);

  const [model, setModel] = useState("");
  const [style, setStyle] = useState("auto");
  const [quality, setQuality] = useState("standard");
  const [size, setSize] = useState("1024x1024");
  const [count, setCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [history, setHistory] = useState<Artwork[]>(loadHistory);
  const [filter, setFilter] = useState<"all" | "favorite">("all");
  const [active, setActive] = useState<Artwork | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!model && imageModels.length > 0) setModel(imageModels[0].id);
  }, [imageModels, model]);

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  const visibleHistory = filter === "favorite"
    ? history.filter((item) => item.favorite)
    : history;

  const toggleFavorite = (id: string) => {
    const target = history.find((item) => item.id === id);
    if (!target) return;
    const nextFavorite = !target.favorite;
    const favorites = readFavoriteIds();
    if (nextFavorite) favorites.add(id);
    else favorites.delete(id);
    persistFavoriteIds(favorites);

    setHistory((items) =>
      items.map((item) =>
        item.id === id ? { ...item, favorite: nextFavorite } : item,
      ),
    );
    setActive((item) =>
      item && item.id === id ? { ...item, favorite: nextFavorite } : item,
    );
    toast.success(nextFavorite ? "已收藏作品" : "已取消收藏");
  };

  const handleReference = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    try {
      setReferenceImage(await readFile(file));
      setReferenceName(file.name);
    } catch {
      toast.error("参考图读取失败");
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("请先输入图片描述");
      return;
    }
    if (!model) {
      toast.error("当前没有可用的绘图模型，请先在模型市场配置 image-generation 模型");
      return;
    }

    const created: Artwork[] = [];
    for (let index = 0; index < count; index += 1) {
      const response = await generateImage({
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim(),
        model,
        style,
        quality,
        size,
      });
      if (!response.status || !response.data) {
        toast.error("图片生成失败", { description: response.error || "请稍后重试" });
        break;
      }
      const src = getImageSource(response.data);
      if (!src) continue;
      created.push({
        id: `${Date.now()}-${index}`,
        src,
        prompt: prompt.trim(),
        model,
        createdAt: Date.now(),
        favorite: false,
      });
    }

    if (created.length > 0) {
      setHistory((items) => [...created, ...items].slice(0, 24));
      setActive(created[0]);
      toast.success(`已生成 ${created.length} 张图片`);
    }
  };

  return (
    <div className="image-studio-page">
      <div className="image-studio-layout">
        <motion.aside
          className="image-studio-panel"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 }}
        >
          <div className="panel-title"><WandSparkles className="h-4 w-4" />创作参数</div>

          <label className="studio-field">
            <span>模型</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {imageModels.length === 0 && <option value="">暂无绘图模型</option>}
              {imageModels.map((item) => <option key={item.id} value={item.id}>{modelLabel(item)}</option>)}
            </select>
          </label>

          <label className="studio-field">
            <span>风格</span>
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              {styleOptions.map((item) => <option key={item} value={item}>{item === "auto" ? "自动" : item}</option>)}
            </select>
          </label>

          <div className="studio-field-row">
            <label className="studio-field"><span>质量</span><select value={quality} onChange={(event) => setQuality(event.target.value)}>{qualityOptions.map((item) => <option key={item} value={item}>{item === "hd" ? "高清" : "标准"}</option>)}</select></label>
            <label className="studio-field"><span>画面比例</span><select value={size} onChange={(event) => setSize(event.target.value)}>{sizeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>

          <label className="studio-field"><span>图片描述</span><Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想要的画面、主体、光线和氛围..." rows={5} /></label>
          <label className="studio-field"><span>反向提示词 <em>可选</em></span><Input value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="不希望出现的内容" /></label>

          <div className="studio-field"><span>图片数量</span><div className="count-control"><Button type="button" variant="outline" size="icon-xs" onClick={() => setCount(Math.max(1, count - 1))}>−</Button><strong>{count}</strong><Button type="button" variant="outline" size="icon-xs" onClick={() => setCount(Math.min(4, count + 1))}>+</Button></div></div>

          <div className="studio-field"><span>参考图 <em>可选</em></span>
            {referenceImage ? <div className="reference-preview"><img src={referenceImage} alt={referenceName} /><button type="button" onClick={() => { setReferenceImage(""); setReferenceName(""); }}><X className="h-3.5 w-3.5" /></button></div> : <button type="button" className="reference-upload" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /><span>上传参考图</span><small>PNG / JPG，最大 10MB</small></button>}
            <input ref={fileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleReference(event.target.files?.[0])} />
          </div>

          <Button className="generate-button" size="lg" loading onClick={handleGenerate}><Sparkles className="h-4 w-4 mr-2" />开始绘图</Button>
        </motion.aside>

        <main className="image-studio-gallery">
          <div className="gallery-toolbar"><div className="gallery-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">全部作品</button><button className={filter === "favorite" ? "active" : ""} onClick={() => setFilter("favorite")} type="button"><Star className="h-3.5 w-3.5" />收藏</button></div><button className="refresh-history" type="button" onClick={() => setHistory([])} disabled={history.length === 0}><RefreshCw className="h-3.5 w-3.5" />清空历史</button></div>
          {visibleHistory.length === 0 ? <motion.div className="gallery-empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><div className="empty-art"><ImageIcon className="h-10 w-10" /><Plus className="h-4 w-4" /></div><h2>你的画布还是空的</h2><p>从左侧输入提示词，生成第一张作品吧</p></motion.div> : <div className="artwork-grid"><AnimatePresence initial={false}>{visibleHistory.map((item, index) => <motion.article className="artwork-card" key={item.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: index * 0.03 }}><button type="button" className="artwork-image" onClick={() => setActive(item)}><img src={item.src} alt={item.prompt} loading="lazy" /><span><Maximize2 className="h-4 w-4" /></span></button><div className="artwork-meta"><p title={item.prompt}>{item.prompt}</p><small>{item.model}</small><div><button type="button" title="收藏" onClick={(event) => { event.stopPropagation(); toggleFavorite(item.id); }} className={item.favorite ? "favorite active" : "favorite"}><Star className="h-3.5 w-3.5" /></button><a href={item.src} download={`coai-${item.id}.png`} title="下载" onClick={(event) => event.stopPropagation()}><Download className="h-3.5 w-3.5" /></a></div></div></motion.article>)}</AnimatePresence></div>}
        </main>
      </div>

      <AnimatePresence>{active && <motion.div className="artwork-lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActive(null)}><motion.div className="lightbox-content" initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} onClick={(event) => event.stopPropagation()}><button type="button" className="lightbox-close" onClick={() => setActive(null)}><X className="h-4 w-4" /></button><img src={active.src} alt={active.prompt} /><div><p>{active.prompt}</p><a href={active.src} download={`coai-${active.id}.png`}><Download className="h-4 w-4" />下载图片</a></div></motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}

export default ImageStudio;
