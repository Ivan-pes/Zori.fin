export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteParams {
  system: string;
  messages: ChatTurn[];
  tools: ToolDef[];
  executeTool: (name: string, input: unknown) => Promise<string>;
  maxIterations?: number;
}

export interface ReadDocumentParams {
  base64: string;
  mediaType: string;
  system: string;
  prompt: string;
}

export interface ClassifyResult {
  category: string;
  confidence: number; // 0..1
}

export interface LLMProvider {
  complete(params: CompleteParams): Promise<string>;
  classify(input: string, categories: string[]): Promise<ClassifyResult>;
  readDocument(params: ReadDocumentParams): Promise<string>;
}
