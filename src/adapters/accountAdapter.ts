import { HttpClient } from "../clients/httpClient";
import { readResponseText } from "../clients/responseText";
import {
  parseConnectionsFromDashboardHtml,
  parseSubscriptionStatusFromSubscriptionsHtml,
} from "../parsers/dashboardParser";
import { elapsedMs, logger } from "../security/logger";

export class AccountAdapter {
  constructor(private readonly http: HttpClient) {}

  async getConnections(): Promise<{ connections?: number }> {
    const startedAt = Date.now();
    logger.info("account.get_connections.start");
    const response = await this.http.request("/dashboard");
    const html = await readResponseText(response);
    const result = { connections: parseConnectionsFromDashboardHtml(html) };
    logger.info("account.get_connections.ok", { connections: result.connections, durationMs: elapsedMs(startedAt) });
    return result;
  }

  async getDashboardSummary(): Promise<{
    isLoggedIn: boolean;
    connections?: number;
    isSubscriber?: boolean;
    planName?: string;
    subscriptionStatus?: {
      isLoggedIn?: boolean;
      isSubscriber?: boolean;
      planName?: string;
      hasSubscription?: boolean;
      hasActiveSubscription?: boolean;
      emptyState?: boolean;
      source: "subscriptions-page";
    };
  }> {
    const startedAt = Date.now();
    logger.info("account.get_dashboard_summary.start");
    const dashboardResponse = await this.http.request("/dashboard");
    const dashboardHtml = await readResponseText(dashboardResponse);
    const subscriptionsResponse = await this.http.request("/subscriptions");
    const subscriptionsHtml = await readResponseText(subscriptionsResponse);
    const isLoggedIn = dashboardResponse.ok && !/\/login/i.test(dashboardResponse.url);
    const subscriptionStatus = parseSubscriptionStatusFromSubscriptionsHtml(subscriptionsHtml);
    const result = {
      isLoggedIn,
      connections: parseConnectionsFromDashboardHtml(dashboardHtml),
      subscriptionStatus,
      isSubscriber: subscriptionStatus.isSubscriber,
      planName: subscriptionStatus.planName,
    };
    logger.info("account.get_dashboard_summary.ok", {
      isLoggedIn: result.isLoggedIn,
      connections: result.connections,
      isSubscriber: result.isSubscriber,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  }

  async getSubscriptionStatus(): Promise<{
    isLoggedIn: boolean;
    isSubscriber?: boolean;
    planName?: string;
    hasSubscription?: boolean;
    hasActiveSubscription?: boolean;
    emptyState?: boolean;
    source: "subscriptions-page";
  }> {
    const startedAt = Date.now();
    logger.info("account.get_subscription_status.start");
    const response = await this.http.request("/subscriptions");
    const html = await readResponseText(response);
    const result = {
      isLoggedIn: response.ok && !/\/login/i.test(response.url),
      ...parseSubscriptionStatusFromSubscriptionsHtml(html),
    };
    logger.info("account.get_subscription_status.ok", {
      isLoggedIn: result.isLoggedIn,
      isSubscriber: result.isSubscriber,
      hasActiveSubscription: result.hasActiveSubscription,
      durationMs: elapsedMs(startedAt),
    });
    return result;
  }
}
