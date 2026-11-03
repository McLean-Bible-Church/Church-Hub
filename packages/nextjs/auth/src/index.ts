import NextAuth from 'next-auth';
import { JWT } from 'next-auth/jwt';
import MinistryPlatform from './provider';
import { cookies } from 'next/headers';
import {
  MinistryPlatformClient,
  TableService,
  ProcedureService,
  parseFilterId,
} from '@church/ministry-platform';

// Re-export types for consumers
export type { Session } from 'next-auth';
import './types'; // Module augmentation for Session type

// Create MP client instances for auth callbacks
const mpClient = new MinistryPlatformClient();
const tableService = new TableService(mpClient);
const procedureService = new ProcedureService(mpClient);

// Type for the stored procedure response
interface UserAuthData {
  User: {
    ContactID: number;
    UserID: number;
    UserGUID: string;
    FirstName: string | null;
    Nickname: string | null;
    LastName: string | null;
    Email: string | null;
    MobilePhone: string | null;
    ImageGuid: string | null;
    HouseholdID: number | null;
  } | null;
  IsAdmin: boolean;
  Roles: string[];
  // Address and HouseholdMembers are available but not needed in session
  // Use /api/profile endpoint for full profile data
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MinistryPlatform({
      clientId: process.env.MINISTRY_PLATFORM_CLIENT_ID!,
      clientSecret: process.env.MINISTRY_PLATFORM_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async jwt({ token, account, profile, trigger }): Promise<JWT> {
      console.log(
        'JWT Callback - trigger:',
        trigger,
        'account:',
        !!account,
        'token exists:',
        !!token,
        'profile:',
        !!profile
      );

      // Initial sign-in: store OAuth tokens and basic profile from OIDC
      // Full user data (groups, admin status, etc.) is fetched in session callback
      if (account && profile) {
        console.log('JWT Callback - Setting initial token from account');

        return {
          ...token,
          accessToken: account.access_token,
          idToken: account.id_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          sub: profile.sub,
          email: profile.email,
          name: profile.name,
          firstName: profile.given_name,
          lastName: profile.family_name,
        } as JWT;
      }

      if (!token) {
        console.log('JWT Callback - No token available');
        return token;
      }

      // Check if token is expired and refresh if needed
      if (token.expiresAt && Date.now() < (token.expiresAt as number) * 1000) {
        console.log('JWT Callback - Token still valid');
        return token;
      }

      console.log('JWT Callback - Token expired, attempting refresh');

      // Token is expired, try to refresh it
      if (token.refreshToken) {
        try {
          const response = await fetch(
            `${process.env.MINISTRY_PLATFORM_BASE_URL}/oauth/connect/token`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: token.refreshToken as string,
                client_id: process.env.MINISTRY_PLATFORM_CLIENT_ID!,
                client_secret: process.env.MINISTRY_PLATFORM_CLIENT_SECRET!,
              }),
            }
          );

          if (response.ok) {
            const refreshedTokens = await response.json();
            console.log('JWT Callback - Token refreshed successfully');
            return {
              ...token,
              accessToken: refreshedTokens.access_token,
              expiresAt: Math.floor(Date.now() / 1000 + refreshedTokens.expires_in),
              refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
            } as JWT;
          } else {
            console.error('JWT Callback - Failed to refresh token:', response.status);
            return token;
          }
        } catch (error) {
          console.error('JWT Callback - Error refreshing token:', error);
          return token;
        }
      }

      console.log('JWT Callback - No refresh token available');
      return token;
    },
    async session({ session, token }) {
      console.log('Session Callback - token exists:', !!token);
      console.log('Token sub:', token?.sub);

      if (token && session.user) {
        session.user.id = token.sub as string;
        session.accessToken = token.accessToken as string;
        session.idToken = token.idToken as string;
        session.sub = token.sub as string;

        // Get admin role ID from environment
        const adminRoleId = process.env.ADMIN_SECURITY_ROLE_ID
          ? parseInt(process.env.ADMIN_SECURITY_ROLE_ID, 10)
          : null;

        // Fetch user profile, admin status, and groups in ONE stored procedure call
        try {
          const result = (await procedureService.executeProcedureWithBody(
            'api_TheHub_GetUserProfile_JSON',
            {
              '@UserGUID': session.sub,
              '@AdminRoleID': adminRoleId,
            }
          )) as unknown as any[][];

          // Parse the JSON response
          // Result format: [[{ Result: '{"User":{...},"IsAdmin":true,"Roles":[...]}' }]]
          let authData: UserAuthData | null = null;

          if (result && result.length > 0 && Array.isArray(result[0]) && result[0].length > 0) {
            const resultObject = result[0][0];
            const jsonKey = Object.keys(resultObject)[0];
            const jsonString = resultObject[jsonKey];
            authData = JSON.parse(jsonString) as UserAuthData;
          }

          if (authData?.User) {
            // Set user profile from stored procedure
            session.contactId = String(authData.User.ContactID);
            session.userId = String(authData.User.UserID);
            session.firstName = authData.User.FirstName || (token.firstName as string) || '';
            session.lastName = authData.User.LastName || (token.lastName as string) || '';
            session.nickname = authData.User.Nickname || undefined;
            session.email = authData.User.Email || (token.email as string) || '';
            session.mobilePhone = authData.User.MobilePhone || undefined;
            session.householdId = authData.User.HouseholdID
              ? String(authData.User.HouseholdID)
              : undefined;

            // Build profile image URL from ImageGuid
            if (authData.User.ImageGuid) {
              const fileUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL;
              session.image = `${fileUrl}/${authData.User.ImageGuid}?$thumbnail=true`;
            }

            // Set admin status and roles (from MP User Groups)
            session.isAdmin = authData.IsAdmin;
            session.roles = authData.Roles;

            console.log('User authenticated:', {
              contactId: session.contactId,
              isAdmin: session.isAdmin,
              groupCount: session.roles?.length || 0,
            });
          } else {
            // No user found - set defaults
            session.firstName = (token.firstName as string) || '';
            session.lastName = (token.lastName as string) || '';
            session.email = (token.email as string) || '';
            session.isAdmin = false;
            session.roles = [];
            console.log('No user found in MP for:', session.sub);
          }
        } catch (error) {
          console.error('Error fetching user auth data from stored procedure:', error);
          // On error, set defaults from token
          session.firstName = (token.firstName as string) || '';
          session.lastName = (token.lastName as string) || '';
          session.email = (token.email as string) || '';
          session.isAdmin = false;
          session.roles = [];
        }

        // Check for admin simulation (only admins can simulate)
        if (session.isAdmin) {
          try {
            const cookieStore = await cookies();
            const simulationCookie = cookieStore.get('admin-simulation');

            if (simulationCookie) {
              const simulation = JSON.parse(simulationCookie.value);

              // Only accept a strictly numeric Contact_ID before it is used in a $filter
              const impersonateContactId = parseFilterId(simulation.contactId);

              if (simulation.type === 'impersonate' && impersonateContactId !== null) {
                // Fetch impersonated user's data using the same stored procedure
                try {
                  // First get the User_GUID for the impersonated contact
                  const users = await tableService.getTableRecords<{
                    User_GUID: string;
                    Display_Name: string;
                  }>('dp_Users', {
                    $select: 'User_GUID, Display_Name',
                    $filter: `Contact_ID=${impersonateContactId}`,
                    $top: 1,
                  });

                  if (users.length > 0 && users[0].User_GUID) {
                    // Call stored procedure for impersonated user
                    const impersonatedResult = (await procedureService.executeProcedureWithBody(
                      'api_TheHub_GetUserProfile_JSON',
                      {
                        '@UserGUID': users[0].User_GUID,
                        '@AdminRoleID': adminRoleId,
                      }
                    )) as unknown as any[][];

                    let impersonatedData: UserAuthData | null = null;
                    if (
                      impersonatedResult &&
                      impersonatedResult.length > 0 &&
                      Array.isArray(impersonatedResult[0]) &&
                      impersonatedResult[0].length > 0
                    ) {
                      const resultObject = impersonatedResult[0][0];
                      const jsonKey = Object.keys(resultObject)[0];
                      const jsonString = resultObject[jsonKey];
                      impersonatedData = JSON.parse(jsonString) as UserAuthData;
                    }

                    session.simulation = {
                      type: 'impersonate',
                      contactId: String(impersonateContactId),
                      originalUserId: session.user.id,
                      originalRoles: session.roles,
                      originalIsAdmin: session.isAdmin,
                    };

                    // Override with impersonated user's data
                    if (impersonatedData?.User) {
                      session.isAdmin = impersonatedData.IsAdmin;
                      session.roles = impersonatedData.Roles;
                    } else {
                      session.isAdmin = false;
                      session.roles = [];
                    }

                    console.log(
                      `Impersonation applied - User: ${users[0].Display_Name}, IsAdmin: ${session.isAdmin}, Roles: ${session.roles?.length || 0}`
                    );
                  } else {
                    // User has no MP account
                    session.simulation = {
                      type: 'impersonate',
                      contactId: String(impersonateContactId),
                      originalUserId: session.user.id,
                      originalRoles: session.roles,
                      originalIsAdmin: session.isAdmin,
                    };
                    session.isAdmin = false;
                    session.roles = [];
                    console.log('Impersonating user with no MP account');
                  }
                } catch (error) {
                  console.error('Error fetching impersonated user data:', error);
                  session.simulation = {
                    type: 'impersonate',
                    contactId: String(impersonateContactId),
                    originalUserId: session.user.id,
                    originalRoles: session.roles,
                    originalIsAdmin: session.isAdmin,
                  };
                  session.isAdmin = false;
                  session.roles = [];
                }
              } else if (simulation.type === 'roles' && Array.isArray(simulation.roles)) {
                // Override roles with simulated roles
                session.simulation = {
                  type: 'roles',
                  originalRoles: session.roles,
                  originalUserId: session.user.id,
                  originalIsAdmin: session.isAdmin,
                };
                session.roles = simulation.roles;
                // When simulating roles, also simulate non-admin unless explicitly set
                session.isAdmin = simulation.isAdmin ?? false;
              }
            }
          } catch (error) {
            console.error('Error applying simulation:', error);
          }
        }
      }

      console.log('Final session:', {
        userId: session.user?.id,
        isAdmin: session.isAdmin,
        roleCount: session.roles?.length || 0,
        simulating: !!session.simulation,
      });
      return session;
    },
  },
});
