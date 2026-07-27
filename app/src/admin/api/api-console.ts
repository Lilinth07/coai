import axios from "axios";
import { getErrorMessage } from "@/utils/base.ts";
import { ApiGroup, ApiRecord, ApiUsageSummary } from "@/api/api-console.ts";

const fallbackSummary: ApiUsageSummary = {
  today_requests: 0,
  month_requests: 0,
  today_tokens: 0,
  month_tokens: 0,
  today_quota: 0,
  month_quota: 0,
  series: [],
};

export async function listAdminApiGroups() {
  try {
    return (await axios.get("/admin/api/groups")).data as { status: boolean; data: ApiGroup[]; error?: string };
  } catch (e) {
    return { status: false, data: [], error: getErrorMessage(e) };
  }
}

export async function setAdminApiGroup(group: ApiGroup) {
  try {
    return (await axios.post("/admin/api/groups", group)).data as { status: boolean; error?: string };
  } catch (e) {
    return { status: false, error: getErrorMessage(e) };
  }
}

export async function deleteAdminApiGroup(id: string) {
  try {
    return (await axios.delete(`/admin/api/groups/${id}`)).data as { status: boolean; error?: string };
  } catch (e) {
    return { status: false, error: getErrorMessage(e) };
  }
}

export async function listAdminApiRecords(page = 1, username = "", model = "") {
  try {
    return (await axios.get("/admin/api/records", { params: { page, page_size: 20, username: username || undefined, model: model || undefined } })).data as {
      status: boolean;
      data: { records: ApiRecord[]; total: number };
      error?: string;
    };
  } catch (e) {
    return { status: false, data: { records: [], total: 0 }, error: getErrorMessage(e) };
  }
}

export async function getAdminApiUsage() {
  try {
    return (await axios.get("/admin/api/usage/summary")).data as { status: boolean; data: ApiUsageSummary; error?: string };
  } catch (e) {
    return { status: false, data: fallbackSummary, error: getErrorMessage(e) };
  }
}
