/** Route template for a request: IDs and query strings removed, so rate-limit buckets and fixtures can be matched. */
export const routeOf = (method: string, path: string) =>
  `${method} ${path.split('?')[0]!.replace(/[0-9A-HJKMNP-TV-Z]{26}/g, ':id')}`;
