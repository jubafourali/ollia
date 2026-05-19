enum class UserActivityStatus {
    ACTIVE,  // last signal within 4h, normal pattern
    QUIET,   // last signal 4–12h ago, or below normal activity
    SILENT   // no signal, or 12h+ ago
}