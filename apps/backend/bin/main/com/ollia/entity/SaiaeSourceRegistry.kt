package com.ollia.entity

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes

@Entity
@Table(name = "saiae_source_registry")
class SaiaeSourceRegistry(

    @Id
    val id: String,

    @Column(nullable = false)
    val name: String,

    @Column(nullable = false)
    val tier: Int,

    @Column(nullable = false)
    val baseWeight: Int,

    @Column(nullable = false)
    val isInstrument: Boolean = false,

    @Column(nullable = false)
    val isAuthoritative: Boolean = false,

    val soloFloor: Int? = null,

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "VARCHAR[]")
    val typicallyRepublishes: Array<String>? = null
)