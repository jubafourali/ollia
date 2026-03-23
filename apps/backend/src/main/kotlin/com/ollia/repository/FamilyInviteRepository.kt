package com.ollia.repository

import com.ollia.entity.FamilyInvite
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FamilyInviteRepository : JpaRepository<FamilyInvite, UUID> {
    fun findByToken(token: String): FamilyInvite?
    fun deleteAllByCreatedBy(createdBy: UUID)
    fun deleteAllByCircleId(circleId: UUID)
}
