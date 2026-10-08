# Notification Scroll Pagination

Replace the header notification show-more button with scroll-triggered pagination. Reuse the existing bottom-reached directive on the notification list's scroll container. Reaching the bottom loads the next page through the existing store, which guards concurrent requests and exhausted pagination. Show an inline loading indicator while fetching more notifications and preserve the current scroll position.
