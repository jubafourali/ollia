package com.ollia.repository

import com.ollia.entity.CollectorCheckpoint
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface CollectorCheckpointRepository: JpaRepository<CollectorCheckpoint, UUID>