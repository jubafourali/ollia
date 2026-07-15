package com.ollia.repository

import com.ollia.entity.FamilyMember
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface FamilyMemberRepository : JpaRepository<FamilyMember, UUID> {
    fun findAllByCircleId(circleId: UUID): List<FamilyMember>
    fun findByCircleIdAndUserId(circleId: UUID, userId: UUID): FamilyMember?
    fun findAllByUserId(userId: UUID): List<FamilyMember>
    fun deleteAllByUserId(userId: UUID)
    fun deleteAllByCircleId(circleId: UUID)
    fun countByCircleId(circleId: UUID): Long

    fun findAllByCircleIdIn(circleIds: List<UUID>): List<FamilyMember>

    @Query("SELECT fm FROM FamilyMember fm JOIN FamilyCircle fc ON fm.circleId = fc.id WHERE fm.userId = :userId AND fc.ownerId IN :ownerIds")
    fun findAllByUserIdAndCircleOwnerId(
        @Param("userId") userId: UUID,
        @Param("ownerIds") ownerIds: List<UUID>
    ): List<FamilyMember>
}
