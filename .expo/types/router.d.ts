/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/booking-details`; params?: Router.UnknownInputParams; } | { pathname: `/bookings`; params?: Router.UnknownInputParams; } | { pathname: `/edit-booking`; params?: Router.UnknownInputParams; } | { pathname: `/expense-reports`; params?: Router.UnknownInputParams; } | { pathname: `/explore`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/operating-expenses`; params?: Router.UnknownInputParams; } | { pathname: `/payments`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/booking-details`; params?: Router.UnknownOutputParams; } | { pathname: `/bookings`; params?: Router.UnknownOutputParams; } | { pathname: `/edit-booking`; params?: Router.UnknownOutputParams; } | { pathname: `/expense-reports`; params?: Router.UnknownOutputParams; } | { pathname: `/explore`; params?: Router.UnknownOutputParams; } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/operating-expenses`; params?: Router.UnknownOutputParams; } | { pathname: `/payments`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; };
      href: Router.RelativePathString | Router.ExternalPathString | `/booking-details${`?${string}` | `#${string}` | ''}` | `/bookings${`?${string}` | `#${string}` | ''}` | `/edit-booking${`?${string}` | `#${string}` | ''}` | `/expense-reports${`?${string}` | `#${string}` | ''}` | `/explore${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `/operating-expenses${`?${string}` | `#${string}` | ''}` | `/payments${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString | Router.ExternalPathString | `/booking-details` | `/bookings` | `/edit-booking` | `/expense-reports` | `/explore` | `/` | `/operating-expenses` | `/payments` | `/_sitemap`; params?: Router.UnknownInputParams; };
    }
  }
}
