import { CommonResponse } from "@/api/common.ts";
import { ChargeProps } from "@/admin/charge.ts";
import { getErrorMessage } from "@/utils/base.ts";
import axios from "axios";

export type ChargeListResponse = CommonResponse & {
  data: ChargeProps[];
};

export type ChargeSyncRequest = {
  overwrite: boolean;
  data: ChargeProps[];
};

export type ChargeFetchRequest = {
  endpoint: string;
  system?: string;
};

export type ChargeFetchResponse = CommonResponse & {
  data: ChargeProps[];
};

export type ChargeScope = "web" | "api";

function chargeBase(scope: ChargeScope) {
  return scope === "api" ? "/admin/api/charge" : "/admin/charge";
}

export async function listCharge(scope: ChargeScope = "web"): Promise<ChargeListResponse> {
  try {
    const response = await axios.get(`${chargeBase(scope)}/list`);
    return response.data as ChargeListResponse;
  } catch (e) {
    return { status: false, error: getErrorMessage(e), data: [] };
  }
}

export async function setCharge(charge: ChargeProps, scope: ChargeScope = "web"): Promise<CommonResponse> {
  try {
    const response = await axios.post(`${chargeBase(scope)}/set`, charge);
    return response.data as CommonResponse;
  } catch (e) {
    return { status: false, error: getErrorMessage(e) };
  }
}

export async function deleteCharge(id: number, scope: ChargeScope = "web"): Promise<CommonResponse> {
  try {
    const response = await axios.get(`${chargeBase(scope)}/delete/${id}`);
    return response.data as CommonResponse;
  } catch (e) {
    return { status: false, error: getErrorMessage(e) };
  }
}

export async function syncCharge(
  data: ChargeSyncRequest,
  scope: ChargeScope = "web",
): Promise<CommonResponse> {
  try {
    const response = await axios.post(`${chargeBase(scope)}/sync`, data);
    return response.data as CommonResponse;
  } catch (e) {
    return { status: false, error: getErrorMessage(e) };
  }
}

export async function fetchUpstreamCharge(
  req: ChargeFetchRequest,
): Promise<ChargeFetchResponse> {
  try {
    const response = await axios.post(`/admin/charge/fetch`, req);
    const data = response.data as ChargeFetchResponse;
    return {
      status: !!data.status,
      error: data.error,
      data: data.data || [],
    };
  } catch (e) {
    return { status: false, error: getErrorMessage(e), data: [] };
  }
}
