// src/types/runtime.types.ts

import { AppConfig, EntityConfig, PageConfig } from "./config.types";

/** Props passed into every runtime-rendered component */
export interface ComponentProps {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
}

/** Current render context — what page + entity is active */
export interface RenderContext {
  appId: string;
  slug: string[];
  path: string;
}

/** A single flattened entity record returned from the API */
export type EntityRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
};

/** State of a single entity data fetch */
export interface EntityFetchState {
  records: EntityRecord[];
  total: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}
