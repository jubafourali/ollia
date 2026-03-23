package com.ollia.repository

import com.ollia.entity.FamilyCircle
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FamilyCircleRepository : JpaRepository<FamilyCircle, UUID> {
    fun findByOwnerId(ownerId: UUID): FamilyCircle?
    fun findAllByOwnerId(ownerId: UUID): List<FamilyCircle>
    fun findByInviteCode(inviteCode: String): FamilyCircle?
    fun deleteAllByOwnerId(ownerId: UUID)
}
