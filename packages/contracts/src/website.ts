export interface WebsiteDto {
  id: string;
  projectId: string;
  name: string;
  url: string;
  normalizedUrl: string;
  host: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebsiteRequest {
  name: string;
  url: string;
}

export interface UpdateWebsiteRequest {
  name?: string;
  url?: string;
}

export interface WebsiteListResponse {
  items: WebsiteDto[];
}