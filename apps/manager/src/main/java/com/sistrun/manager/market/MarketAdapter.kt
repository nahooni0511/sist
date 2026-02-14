package com.sistrun.manager.market

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.sistrun.manager.R

class MarketAdapter(
    private val onActionClick: (MarketApp) -> Unit
) : RecyclerView.Adapter<MarketAdapter.ViewHolder>() {

    private val items = mutableListOf<MarketApp>()

    fun submitList(apps: List<MarketApp>) {
        items.clear()
        items.addAll(apps)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_market_app, parent, false)
        return ViewHolder(view)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position], onActionClick)
    }

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val nameText: TextView = itemView.findViewById(R.id.nameText)
        private val packageText: TextView = itemView.findViewById(R.id.packageText)
        private val versionText: TextView = itemView.findViewById(R.id.versionText)
        private val installedText: TextView = itemView.findViewById(R.id.installedText)
        private val changelogText: TextView = itemView.findViewById(R.id.changelogText)
        private val actionButton: Button = itemView.findViewById(R.id.actionButton)

        fun bind(item: MarketApp, onActionClick: (MarketApp) -> Unit) {
            nameText.text = item.displayName
            packageText.text = item.packageName
            versionText.text = itemView.context.getString(
                R.string.market_version,
                item.latestVersionName,
                item.latestVersionCode
            )
            installedText.text = itemView.context.getString(
                R.string.installed_version,
                item.installedVersionCode
            )

            changelogText.text = if (item.changelog.isBlank()) "변경사항 없음" else item.changelog

            when {
                item.installedVersionCode < 0 -> {
                    actionButton.isEnabled = true
                    actionButton.text = itemView.context.getString(R.string.action_install)
                }

                item.needsInstallOrUpdate -> {
                    actionButton.isEnabled = true
                    actionButton.text = itemView.context.getString(R.string.action_update)
                }

                else -> {
                    actionButton.isEnabled = false
                    actionButton.text = itemView.context.getString(R.string.action_latest)
                }
            }

            actionButton.setOnClickListener { onActionClick(item) }
        }
    }
}
