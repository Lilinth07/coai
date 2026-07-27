import axios from "axios";
import { CommonResponse } from "@/api/common.ts";
import { ChargeProps } from "@/admin/charge.ts";
import { getErrorMessage } from "@/utils/base.ts";

export type ApiKey = {
  id: number;
  name: string;
  key?: string;
  masked_key: string;
  disabled: boolean;
  expired_at: string;
  quota: number;
  used_quota: number;
  infinite_quota: boolean;
  ip_whitelist: string;
  model_whitelist: string;
  token_group: string;
  last_used_at: string;
  created_at: string;
};

export type ApiKeyForm = Pick<
  ApiKey,
  | "name"
  | "disabled"
  | "expired_at"
  | "quota"
  | "infinite_quota"
  | "ip_whitelist"
  | "model_whitelist"
  | "token_group"
>;

export type ApiGroup = {
  id: string;
  name: string;
  channel_group: string;
  ratio: number;
  enabled: boolean;
  min_level: number;
  description: string;
};

export type ApiRecord = {
  id: number;
  request_id: string;
  key_id: number;
  key_name: string;
  username: string;
  model: string;
  actual_model: string;
  token_group: string;
  channel_id: number;
  channel_name: string;
  input_tokens: number;
  output_tokens: number;
  quota: number;
  duration: number;
  is_stream: boolean;
  status: string;
  error: string;
  client_ip: string;
  created_at: string;
};

export type UsagePoint = {
  date: string;
  requests: number;
  tokens: number;
  quota: number;
};

export type ApiUsageSummary = {
  today_requests: number;
  month_requests: number;
  today_tokens: number;
  month_tokens: number;
  today_quota: number;
  month_quota: number;
  series: UsagePoint[];
};

const emptySummary: ApiUsageSummary = {
  today_requests: 0,
  month_requests: 0,
  today_tokens: 0,
  month_tokens: 0,
  today_quota: 0,
  month_quota: 0,
  series: [],
};

async function safe<T>(request: Promise<{ data: T }>, fallback: T): Promise<T> {
  try {
    return (await request).data;
  } catch (e) {
    return { ...(fallback as any), status: false, error: getErrorMessage(e) };
  }
}

export const listApiKeys = () =>
  safe(axios.get("/keys"), { status: false, data: [] as ApiKey[] });

export const createApiKey = (data: ApiKeyForm) =>
  safe(axios.post("/keys", data), { status: false, data: null as ApiKey | null, error: "" });

export const updateApiKey = (id: number, data: ApiKeyForm) =>
  safe<CommonResponse>(axios.put(`/keys/${id}`, data), { status: false });

export const deleteApiKey = (id: number) =>
  safe<CommonResponse>(axios.delete(`/keys/${id}`), { status: false });

export const resetApiKey = (id: number) =>
  safe(axios.post(`/keys/${id}/reset`), {
    status: false,
    data: { key: "" },
    error: "",
  });

export const listApiGroups = () =>
  safe(axios.get("/key-groups"), { status: false, data: [] as ApiGroup[] });

export const getApiUsage = () =>
  safe(axios.get("/api-usage"), { status: false, data: emptySummary });

export const listApiRecords = (page = 1, keyId = 0, model = "") =>
  safe(
    axios.get("/api-records", {
      params: { page, page_size: 20, key_id: keyId || undefined, model: model || undefined },
    }),
    { status: false, data: { records: [] as ApiRecord[], total: 0 } },
  );

export const listApiPricing = () =>
  safe(axios.get("/api-pricing"), { status: false, data: [] as ChargeProps[] });
