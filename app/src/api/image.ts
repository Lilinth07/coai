import axios from "axios";
import { getErrorMessage } from "@/utils/base.ts";

export type ImageGenerationRequest = {
  prompt: string;
  negative_prompt?: string;
  model: string;
  style?: string;
  quality?: string;
  size?: string;
};

export type ImageGenerationResult = {
  url?: string;
  b64_json?: string;
  quota?: number;
  prompt?: string;
};

export type ImageGenerationResponse = {
  status: boolean;
  data?: ImageGenerationResult;
  error?: string;
};

export async function generateImage(
  form: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  try {
    const response = await axios.post("/generation/image", form);
    return response.data as ImageGenerationResponse;
  } catch (error) {
    return {
      status: false,
      error: getErrorMessage(error),
    };
  }
}
