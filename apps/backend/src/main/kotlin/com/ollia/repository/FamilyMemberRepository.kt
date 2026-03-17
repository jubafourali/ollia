package com.ollia.repository

import com.ollia.entity.FamilyMember
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FamilyMemberRepository : JpaRepository<FamilyMember, UUID> {
    fun findAllByCircleId(circleId: UUID): List<FamilyMember>
    fun findByCircleIdAndUserId(circleId: UUID, userId: UUID): FamilyMember?
    fun findAllByUserId(userId: UUID): List<FamilyMember>
    fun deleteAllByUserId(userId: UUID)
}
