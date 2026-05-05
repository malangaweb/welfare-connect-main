/// App-wide constants based on design system
class AppConstants {
  // Colors (reference to design tokens)
  static const colorPrimary = 0xFF1b3a19;
  static const colorPrimaryContainer = 0xFF31512e;
  static const colorSurface = 0xFFf9f9ff;
  static const colorOnSurface = 0xFF111c2d;
  static const colorOnSurfaceVariant = 0xFF434840;
  static const colorSecondary = 0xFF565e74;
  static const colorTertiary = 0xFF4b2c00;
  static const colorError = 0xFFba1a1a;

  // Spacing
  static const double spacingXxs = 4.0;
  static const double spacingXs = 8.0;
  static const double spacingSm = 12.0;
  static const double spacingMd = 16.0;
  static const double spacingLg = 24.0;
  static const double spacingXl = 32.0;
  static const double spacingXxl = 48.0;

  // Border radius
  static const double radiusSmall = 4.0;
  static const double radiusMedium = 8.0;
  static const double radiusLarge = 16.0;
  static const double radiusXl = 24.0;
  static const double radiusXxl = 30.0; // for hero elements
  static const double radiusFull = 9999.0;

  // Spacing - matching design tokens
  static const double marginEdge = 24.0;
  static const double gutter = 16.0;
  static const double cardPadding = 20.0;
  static const double sectionGap = 32.0;

  // Elevation / Shadow
  static const double elevationCard = 2.0;
  static const double elevationBottomNav = 8.0;
  static const double elevationFab = 12.0;

  // Animation durations
  static const Duration animationShort = Duration(milliseconds: 150);
  static const Duration animationMedium = Duration(milliseconds: 300);
  static const Duration animationLong = Duration(milliseconds: 500);

  // Breakpoints (mobile-first)
  static const double mobileMaxWidth = 480.0;
  static const double tabletBreakpoint = 768.0;

  // Icons
  static const String iconNaturePeople = 'nature_people';
  static const String iconBadge = 'badge';
  static const String iconCall = 'call';
  static const String iconLogin = 'login';
  static const String iconLogout = 'logout';
  static const String iconDashboard = 'dashboard';
  static const String iconGroup = 'group';
  static const String iconPayments = 'payments';
  static const String iconAnalytics = 'analytics';
  static const String iconNotifications = 'notifications';
  static const String iconArrowDownward = 'arrow_downward';
  static const String iconArrowUpward = 'arrow_upward';
  static const String iconAddCard = 'add_card';
  static const String iconSend = 'send';
  static const String iconGridView = 'grid_view';
  static const String iconAssignment = 'assignment';
  static const String iconWidgets = 'widgets';
  static const String iconPerson = 'person';
  static const String iconSouthWest = 'south_west';
  static const String iconNorthEast = 'north_east';
  static const String iconAccountBalanceWallet = 'account_balance_wallet';
  static const String iconVerifiedUser = 'verified_user';
  static const String iconHistory = 'history';
  static const String iconSmartphone = 'smartphone';
  static const String iconReceiptLong = 'receipt_long';
  static const String iconArrowForward = 'arrow_forward';
  static const String iconMenu = 'menu';
  static const String iconChevronRight = 'chevron_right';
  static const String iconMoreHoriz = 'more_horiz';
  static const String iconTaskAlt = 'task_alt';
  static const String iconCheckCircle = 'check_circle';
  static const String iconPendingActions = 'pending_actions';
  static const String iconTrendingUp = 'trending_up';
}
