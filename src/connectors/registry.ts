import type { Connector } from '../core/types.ts';
import type { SourceDef } from '../db/repository.ts';
import { connector as dccaConnector, sourceDef as dccaSourceDef } from './dcca/index.ts';
import { connector as ircupConnector, sourceDef as ircupSourceDef } from './ircup/index.ts';
import { connector as iccraConnector, sourceDef as iccraSourceDef } from './iccra/index.ts';
import { connector as cccConnector, sourceDef as cccSourceDef } from './ccc/index.ts';
import { connector as ccaConnector, sourceDef as ccaSourceDef } from './cca/index.ts';

export interface RegisteredConnector {
  connector: Connector;
  sourceDef: SourceDef;
}

export const connectors: Record<string, RegisteredConnector> = {
  dcca: { connector: dccaConnector, sourceDef: dccaSourceDef },
  ircup: { connector: ircupConnector, sourceDef: ircupSourceDef },
  iccra: { connector: iccraConnector, sourceDef: iccraSourceDef },
  ccc: { connector: cccConnector, sourceDef: cccSourceDef },
  cca: { connector: ccaConnector, sourceDef: ccaSourceDef },
};

export function getConnector(id: string): RegisteredConnector {
  const entry = connectors[id];
  if (!entry) {
    throw new Error(`Unknown connector: ${id}. Available: ${Object.keys(connectors).join(', ') || '(none)'}`);
  }
  return entry;
}
