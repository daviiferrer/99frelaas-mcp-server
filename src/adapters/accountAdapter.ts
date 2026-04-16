import { HttpClient } from "../clients/httpClient";
import { readResponseText } from "../clients/responseText";
import {
  parseConnectionsFromDashboardHtml,
  parseSubscriptionStatusFromSubscriptionsHtml,
} from "../parsers/dashboardParser";

export class AccountAdapter {
  constructor(private readonly http: HttpClient) {}

  async getConnections(): Promise<{ connections?: number }> {
    const response = await this.http.request("/dashboard");
    const html = await readResponseText(response);
    return { connections: parseConnectionsFromDashboardHtml(html) };
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
    const dashboardResponse = await this.http.request("/dashboard");
    const dashboardHtml = await readResponseText(dashboardResponse);
    const subscriptionsResponse = await this.http.request("/subscriptions");
    const subscriptionsHtml = await readResponseText(subscriptionsResponse);
    const isLoggedIn = dashboardResponse.ok && !/\/login/i.test(dashboardResponse.url);
    const subscriptionStatus = parseSubscriptionStatusFromSubscriptionsHtml(subscriptionsHtml);
    return {
      isLoggedIn,
      connections: parseConnectionsFromDashboardHtml(dashboardHtml),
      subscriptionStatus,
      isSubscriber: subscriptionStatus.isSubscriber,
      planName: subscriptionStatus.planName,
    };
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
    const response = await this.http.request("/subscriptions");
    const html = await readResponseText(response);
    return {
      isLoggedIn: response.ok && !/\/login/i.test(response.url),
      ...parseSubscriptionStatusFromSubscriptionsHtml(html),
    };
  }
}
