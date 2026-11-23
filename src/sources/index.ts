import type { ShopbyClient } from "../shopby.js";
import { musinsaSource } from "./musinsa.js";
import { thirtymallSource } from "./thirtymall.js";
import { twentynineSource } from "./twentynine.js";
import type { Source, SourceId } from "./types.js";

export function defaultSources(client: Pick<ShopbyClient, "search">): Record<SourceId, Source> {
  return {
    thirtymall: thirtymallSource(client),
    musinsa: musinsaSource(),
    "29cm": twentynineSource(),
  };
}
