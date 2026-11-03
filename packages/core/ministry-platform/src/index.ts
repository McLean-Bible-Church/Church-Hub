// Core client
export { MinistryPlatformClient } from './core/client';
export { getClientCredentialsToken } from './core/clientCredentials';

// Services
export { TableService } from './services/tableService';
export { ProcedureService } from './services/procedureService';
export { searchContacts, getContactById } from './services/contactService';

// Utils
export { HttpClient } from './utils/httpClient';
export {
  FilterValueError,
  parseFilterId,
  filterId,
  parseFilterDate,
  filterDate,
  quoteFilterDate,
  escapeFilterString,
  quoteFilterString,
  sanitizeSearchTerm,
  likeContains,
  MAX_SEARCH_TERM_LENGTH,
} from './utils/filter';

// Interfaces
export * from './interfaces/mpProviderInterfaces';
