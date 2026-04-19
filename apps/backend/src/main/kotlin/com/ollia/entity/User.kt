package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
class User(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(unique = true, nullable = false)
    val clerkId: String,

    @Column(nullable = false)
    var name: String,

    @Column(nullable = false)
    var email: String,

    var region: String? = null,

    @Column(nullable = false)
    var travelMode: Boolean = false,

    var travelDestination: String? = null,

    var lastSeenAt: Instant? = null,

    @Column(nullable = false)
    var plan: String = "free",

    var stripeCustomerId: String? = null,

    var stripeSubscriptionId: String? = null,

    @Column(nullable = false)
    var notifyActivity: Boolean = true,

    @Column(nullable = false)
    var notifyInactivity: Boolean = true,

    @Column(nullable = false)
    var inactivityThresholdHours: Int = 3,

    @Column(nullable = false)
    var escalationLevel: Int = 0,

    var escalationChangedAt: Instant? = null,

    var emergencyContactName: String? = null,

    var emergencyContactPhone: String? = null,

    var scheduledCheckInDeadline: Instant? = null,

    @Column(nullable = false)
    var preferredLanguage: String = "en",

    @Column(unique = true)
    var shortcutToken: UUID? = null,

    var lastCheckInAt: Instant? = null,

    var lastPassiveSignalAt: Instant? = null,

    var nudgeSentAt: Instant? = null,

    var secondNudgeSentAt: Instant? = null,

    @Column(nullable = false)
    var familyNotified: Boolean = false,

    @Column(nullable = false)
    var familyNotifiedStrong: Boolean = false,

    @Column(nullable = false)
    var urgentOvernightAlerts: Boolean = false,

    var timezone: String? = null,

    @Column(nullable = false)
    var foundingMember: Boolean = false,

    var foundingExpiresAt: Instant? = null,

    @Column(name = "founding_claimed_at")
    var foundingClaimedAt: Instant? = null,

    val createdAt: Instant = Instant.now()
) {
    /**
     * Plan resolution that honors the founding-member grant. While
     * foundingMember is true and foundingExpiresAt is in the future the user
     * is effectively premium, regardless of their Stripe `plan` column.
     */
    fun effectivePlan(now: Instant = Instant.now()): String {
        if (foundingMember && foundingExpiresAt?.isAfter(now) == true) return "premium"
        return plan
    }
}
