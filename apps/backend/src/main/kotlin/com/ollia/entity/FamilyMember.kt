package com.ollia.entity

import jakarta.persistence.*
import java.util.UUID

@Entity
@Table(name = "family_members")
class FamilyMember(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val circleId: UUID,

    @Column(nullable = false)
    val userId: UUID,

    @Column(nullable = false)
    val role: String = "member"
)
