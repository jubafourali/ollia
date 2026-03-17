package com.ollia.repository

import com.ollia.entity.ActivitySignal
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ActivitySignalRepository : JpaRepository<ActivitySignal, UUID> {
    fun deleteAllByUserId(userId: UUID)
}
