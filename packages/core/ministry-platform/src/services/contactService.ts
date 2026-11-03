import { MinistryPlatformClient } from '../core/client';
import { TableService } from './tableService';
import { filterId, likeContains, sanitizeSearchTerm } from '../utils/filter';

interface Contact {
  Contact_ID: number;
  Display_Name: string;
  Email_Address: string | null;
  First_Name: string | null;
  Last_Name: string | null;
  Nickname: string | null;
  User_Account: number | null;
  dp_fileUniqueId: string | null;
}

// Create shared client and service instances
const mpClient = new MinistryPlatformClient();
const tableService = new TableService(mpClient);

/**
 * Search for contacts by name or email.
 * Only returns contacts with a User_Account (i.e., they can log in).
 *
 * @param query - Search term (min 2 characters)
 * @param userId - User ID for audit logging
 * @param limit - Max results (default 20)
 */
export async function searchContacts(
  query: string,
  userId: number,
  limit: number = 20
): Promise<Contact[]> {
  // Restrict to a safe character set/length, then quote-escape for the LIKE literal
  const term = sanitizeSearchTerm(query);
  if (term.length < 2) return [];
  const like = likeContains(term);
  const top = Math.min(Math.max(Math.trunc(Number(limit)) || 20, 1), 100);

  const contacts = await tableService.getTableRecords<Contact>('Contacts', {
    $select:
      'Contact_ID, Display_Name, Email_Address, First_Name, Last_Name, Nickname, User_Account, dp_fileUniqueId',
    $filter: `(Display_Name LIKE ${like} OR Email_Address LIKE ${like}) AND User_Account IS NOT NULL`,
    $orderby: 'Display_Name',
    $top: top,
  });

  return contacts;
}

/**
 * Get a single contact by ID.
 *
 * @param contactId - Contact ID to fetch
 * @param userId - User ID for audit logging
 */
export async function getContactById(contactId: number, userId: number): Promise<Contact | null> {
  const contacts = await tableService.getTableRecords<Contact>('Contacts', {
    $select:
      'Contact_ID, Display_Name, Email_Address, First_Name, Last_Name, Nickname, User_Account, dp_fileUniqueId',
    $filter: `Contact_ID = ${filterId(contactId)}`,
    $top: 1,
  });

  return contacts.length > 0 ? contacts[0] : null;
}
